Math.lerp = function(a, b, t) {
	return (1 - t) * a + b * t;
};

function shortAngleDist(a0, a1) {
	let max = Math.PI * 2;
	let da = (a1 - a0) % max;
	return 2.0 * da % max - da;
}

Math.angleLerp = function(a0, a1, t) {
    return a0 + shortAngleDist(a0, a1) * t;
};

function tok(type, value) {
	return { type: type, value: value };
}

// FABRIK Implementation
/**
 * 
 * @param {Stick} stik 
 */
function _ikSticks(stik, maxDepth) {
	maxDepth = maxDepth || stik.ik;
	if (maxDepth === 0) return null;
	let n = stik;
	let nodes = [];
	let depth = 0;
	while (n !== null && depth < maxDepth) {
		nodes.push(n);
		n = n.parent;
		depth++;
	}
	return nodes;
}

/**
 * 
 * @param {Stick} stik 
 * @param {Array<Vec2>} segments
 */
function _transferIK(stik, segments) {
	if (stik.ik === 0) return;
	let n = stik;
	let i = 0;
	while (n !== null && i < stik.ik) {
		let vec = segments[i].sub(segments[i + 1]);
		let ang = Math.atan2(vec.y, vec.x);
		let pang = n.parent !== null ? n.parent.globalRotation : 0;
		n.rotation = ang - pang;
		n = n.parent;
		i++;
	}
}

/**
 * 
 * @param {Vec2} head 
 * @param {Vec2} tail 
 * @param {Vec2} tgt 
 */
function _reach(head, tail, tgt) {
	let c_dx = tail.x - head.x;
	let c_dy = tail.y - head.y;
	let c_dist = Math.sqrt(c_dx * c_dx + c_dy * c_dy);

	let s_dx = tail.x - tgt.x;
	let s_dy = tail.y - tgt.y;
	let s_dist = Math.sqrt(s_dx * s_dx + s_dy * s_dy);

	let scale = c_dist / s_dist;

	return [
		new Vec2(tgt.x, tgt.y),
		new Vec2(tgt.x + s_dx * scale, tgt.y + s_dy * scale)
	];
}

/**
 * 
 * @param {Array<Vec2>} segments
 * @param {Vec2} tgt 
 */
function _fabrik(segments, tgt) {
	let base = new Vec2(segments[segments.length - 1]);

	// Forward
	for (let i = 0; i < segments.length - 1; i++) {
		let r = _reach(segments[i], segments[i + 1], tgt);
		segments[i] = r[0];
		tgt = r[1];
	}
	segments[segments.length - 1] = tgt;

	// Backward
	tgt = base;
	for (let i = segments.length - 1; i > 0; i--) {
		let r = _reach(segments[i], segments[i - 1], tgt);
		segments[i] = r[0];
		tgt = r[1];
	}
	segments[0] = tgt;
}

/**
 * 
 * @param {Stick} stik 
 */
function _ikNodes(stik) {
	if (stik.ik === 0) return null;
	let n = stik;
	let nodes = [];
	let depth = 0;
	while (n !== null && depth <= stik.ik) {
		nodes.push(new Vec2(n.tipX, n.tipY));
		n = n.parent;
		depth++;
	}
	return nodes;
}

class KeyFrame {
	constructor(frame, rotation, x, y) {
		this.frame = frame || 0;
		this.rotationValue = rotation || 0;
		this.xValue = x || 0;
		this.yValue = y || 0;
	}
}

const SELECTOR_RADIUS = 5;
class Stick {
	/**
	 * 
	 * @param {number} length Stick length
	 * @param {number} rotation Stick angle
	 * @param {number} width Stick thickness
	 * @param {Array} color Stick color (RGB)
	 */
	constructor(length, rotation, width, color) {
		this.x = 0;
		this.y = 0;
		this.rotation = rotation || 0;
		this.length = length || 30;
		this.width = width || 12;
		this.color = color || [0, 0, 0];
		this.name = 'stick';
		this.shape = 'line';
		this.ik = 0;
		this.bendy = 0;

		this.animationMode = false;
		this.animatedValues = {
			x: 0,
			y: 0,
			rotation: 0
		};

		/** @type {Stick} */
		this.parent = null;

		/** @type {Array<Stick>} */
		this.children = [];

		/** @type {Array<KeyFrame>} */
		this.keyFrames = [];
	}

	/**
	 * Adds a new child stick to this stick
	 * @param {number} length Stick length
	 * @param {number} rotation Stick angle
	 * @param {number} width Stick thickness
	 * @param {Array} color Stick color (RGB)
	 */
	addStick(length, rotation, width, color) {
		let stick = new Stick(length, rotation, width, color);
		stick.parent = this;
		this.children.push(stick);
		return stick;
	}

	isAnimating() {
		let anim = this.animationMode;
		if (this.parent !== null) {
			anim = anim || this.parent.isAnimating();
		}
		return anim;
	}

	get root() {
		let r = this.parent;
		if (r === null) return this;
		while (r.parent !== null) r = r.parent;
		return r;
	}

	get globalRotation() {
		let rot = this.animationMode ? this.animatedValues.rotation : this.rotation;
		if (this.parent !== null) {
			rot += this.parent.globalRotation;
		}
		return rot;
	}

	get globalX() {
		let x = this.animationMode ? this.animatedValues.x : this.x;
		if (this.parent !== null) {
			x += this.parent.globalX + Math.cos(this.parent.globalRotation) * this.parent.length;
		}
		return x;
	}

	get globalY() {
		let y = this.animationMode ? this.animatedValues.y : this.y;
		if (this.parent !== null) {
			y += this.parent.globalY + Math.sin(this.parent.globalRotation) * this.parent.length;
		}
		return y;
	}

	get tipX() {
		let x = this.globalX;
		x += Math.cos(this.globalRotation) * this.length;
		return x;
	}

	get tipY() {
		let y = this.globalY;
		y += Math.sin(this.globalRotation) * this.length;
		return y;
	}

	animate(frame) {
		for (let i = 0; i < this.keyFrames.length - 1; i++) {
			let ck = this.keyFrames[i];
			let nk = this.keyFrames[i + 1];
			if (frame >= ck.frame && frame < nk.frame) {
				let frac = (frame - ck.frame) / (nk.frame - ck.frame);
				let lx = Math.lerp(ck.xValue, nk.xValue, frac);
				let ly = Math.lerp(ck.yValue, nk.yValue, frac);
				let lr = Math.angleLerp(ck.rotationValue, nk.rotationValue, frac);
				this.animatedValues.x = lx;
				this.animatedValues.y = ly;
				this.animatedValues.rotation = lr;
				return;
			}
		}

		if (this.keyFrames.length <= 0) {
			this.animatedValues.x = this.x;
			this.animatedValues.y = this.y;
			this.animatedValues.rotation = this.rotation;
			return;
		}

		let last = this.keyFrames[this.keyFrames.length-1];
		this.animatedValues.x = last.xValue;
		this.animatedValues.y = last.yValue;
		this.animatedValues.rotation = last.rotationValue;
	}

	getKeyframe(frame) {
		for (let i = 0; i < this.keyFrames.length; i++) {
			let ck = this.keyFrames[i];
			if (frame === ck.frame) return ck;
		}
		return null;
	}

	getClosestKeyframe(frame) {
		for (let i = 0; i < this.keyFrames.length - 1; i++) {
			let ck = this.keyFrames[i];
			let nk = this.keyFrames[i + 1];
			if (frame >= ck.frame && frame < nk.frame) return ck;
		}

		if (this.keyFrames.length > 0) {
			return this.keyFrames[this.keyFrames.length - 1];
		}

		return null;
	}

	/**
	 * 
	 * @param {number} frame 
	 * @param {KeyFrame} kf 
	 */
	insertKeyframe(kf) {
		let ekf = null;
		for (let k of this.keyFrames) {
			if (k.frame === kf.frame) {
				ekf = k;
				break;
			}
		}
		if (ekf === null) {
			this.keyFrames.push(kf);
		} else {
			ekf.xValue = kf.xValue;
			ekf.yValue = kf.yValue;
			ekf.rotationValue = kf.rotationValue;
		}
		this.keyFrames.sort(function(a, b) { return a.frame - b.frame });
	}
	
	getClosestBendyChild() {
		let bc = this.bendy >= 2 ? this : null;
		if (bc === null) {
			for (let c of this.children) {
				let cbc = c.getClosestBendyChild();
				if (cbc !== null) {
					bc = cbc;
					break;
				}
			}
		}
		return bc;
	}

	/**
	 * Renders this stick and its children
	 * @param {CanvasRenderingContext2D} ctx 
	 */
	render(ctx, colorOverride, renderChildren) {
		renderChildren = renderChildren || true;

		let bendyChild = this.getClosestBendyChild();

		let bendySticks = bendyChild !== null ? _ikSticks(bendyChild, bendyChild.bendy) : [];
		bendySticks.reverse();
		if (bendySticks.length > 2)
			bendySticks.splice(0, 1);

		let color = `rgb(${this.color[0]}, ${this.color[1]}, ${this.color[2]})`;
		ctx.save();
			if (this.shape === 'line') {
				ctx.strokeStyle = colorOverride || color;
				ctx.lineWidth = this.width;
				ctx.lineCap = 'round';
				ctx.lineJoin = 'round';
				if (this.bendy >= 2) {
					let sticks = _ikSticks(this, this.bendy);
					sticks.reverse();

					let points = [];
					if (sticks.length === 2) {
						points.push([ sticks[0].globalX, sticks[0].globalY ]);
					}

					for (let i = 1; i < sticks.length; i++) {
						points.push([sticks[i].globalX, sticks[i].globalY]);
					}
					points.push([sticks[sticks.length - 1].tipX, sticks[sticks.length - 1].tipY]);

					// console.log(points);

					ctx.beginPath();
					ctx.moveTo(points[0][0], points[0][1]);
					let i = 0;
					for (i = 1; i < points.length-2; i++) {
						let xc = (points[i][0] + points[i + 1][0]) / 2;
						let yc = (points[i][1] + points[i + 1][1]) / 2;
						ctx.quadraticCurveTo(points[i][0], points[i][1], xc, yc);
					}
					// last 2 points
					ctx.quadraticCurveTo(points[i][0], points[i][1], points[i+1][0],points[i+1][1]);

					ctx.stroke();
				} else if (!bendySticks.includes(this)) {
					ctx.beginPath();
					ctx.moveTo(this.globalX, this.globalY);
					ctx.lineTo(this.tipX, this.tipY);
					ctx.stroke();
				}
			} else if (this.shape === 'circle') {
				ctx.fillStyle = colorOverride || color;
				ctx.beginPath();
				//ctx.translate(this.length / 2, 0);
				//ctx.rotate(this.globalRotation);
				ctx.translate(this.globalX, this.globalY);
				ctx.rotate(this.globalRotation);
				ctx.translate(this.length / 2, 0);
				ctx.arc(0, 0, this.length / 2, 0, Math.PI * 2);
				ctx.fill();
			}
		ctx.restore();

		if (renderChildren) {
			for (let s of this.children) {
				s.render(ctx, colorOverride);
			}
		}
	}

	/**
	 * Renders the selectors of this figure
	 * @param {CanvasRenderingContext2D} ctx 
	 */
	renderSelector(ctx) {
		ctx.save();

		if (this.parent === null) {
			ctx.beginPath();
			ctx.fillStyle = 'orange';
			ctx.arc(this.globalX, this.globalY, SELECTOR_RADIUS, 0, Math.PI * 2);
			ctx.fill();
		} else {
			ctx.beginPath();
			ctx.fillStyle = this.ik > 0 ? 'lime' : 'red';
			ctx.arc(this.tipX, this.tipY, SELECTOR_RADIUS, 0, Math.PI * 2);
			ctx.fill();
		}

		ctx.restore();

		for (let s of this.children) {
			s.renderSelector(ctx);
		}
	}

	/**
	 * Renders the ghost of this figure
	 * @param {CanvasRenderingContext2D} ctx 
	 */
	renderGhost(ctx, frame) {
		let ckf = this.getClosestKeyframe(frame);
		if (!ckf) return;

		this.animationMode = true;
		this.animate(frame);
		this.render(ctx, '#aaa', false);
		this.animationMode = false;

		for (let s of this.children) {
			s.renderGhost(ctx, frame);
		}
	}

	get clickablePoints() {
		let pts = [];

		if (this.parent === null) pts.push([this.globalX, this.globalY]);
		else pts.push([this.tipX, this.tipY]);
		
		return pts;
	}

	get allChildren() {
		let children = [this, ...this.children];
		for (let ob of this.children) {
			children.push(...ob.allChildren);
		}

		let unq = [];
		for (let c of children) {
			if (!unq.includes(c)) unq.push(c);
		}

		return unq;
	}

}

class StickParser {
	/**
	 * 
	 * @param {string} data 
	 */
	constructor(data) {
		this.data = data.split('');
	}

	next() {
		if (this.data.length === 0) return null;
		return this.data.shift();
	}

	peek() { return this.data[0]; }

	/**
	 * 
	 * @param {RegExp} regexp 
	 */
	expect(regexp, err) {
		if (!regexp.test(this.peek())) {
			throw err;
		}
		return true;
	}

	/**
	 * 
	 * @param {RegExp} regexp 
	 */
	read(regexp) {
		let ret = '';
		while (this.data.length > 0 && regexp.test(this.peek())) {
			ret += this.next();
		}
		return ret;
	}

	/**
	 * 
	 * @param {RegExp} regexp 
	 */
	readUntil(regexp) {
		let ret = '';
		while (this.data.length > 0 && !regexp.test(this.peek())) {
			ret += this.next();
		}
		return ret;
	}

	skipSpaces() {
		this.read(/\s/);
	}

	readIdentifier() {
		return tok('id', this.read(/[a-zA-Z_]/));
	}

	readNumber() {
		let num = '';
		if (this.peek() === '-') {
			this.next();
			num += '-';
		}
		num += this.read(/[0-9]/);
		if (this.peek() === '.') {
			this.next();
			num += '.' + this.read(/[0-9]/);
		}

		num = parseFloat(num);
		if (this.peek().toLowerCase() === 'd') {
			this.next();
			num = num * Math.PI / 180.0;
		}
		return tok('num', num);
	}

	readString() {
		let str = '';
		if (this.peek() === '\'') {
			this.next();
		} else {
			throw 'Excpected a opening single quote on string.';
		}
		str = this.readUntil(/'/);
		if (!this.peek() === '\'') {
			throw 'Excpected a closing single quote on string.';
		} else {
			this.next();
		}
		return tok('str', str);
	}

	readBool() {
		let idTok = this.readIdentifier();
		let id = idTok.value.toLowerCase();
		if (id === 'true') return tok('bool', true);
		else if (id === 'false') return tok('bool', false);
		return idTok;
	}

	readAtom() {
		let p = this.peek();
		if (p === '\'') {
			return this.readString();
		} else if (/[0-9-\.]/.test(p)) {
			return this.readNumber();
		} else if (/[a-zA-Z_]/.test(p)) {
			return this.readBool();
		} else if (p === '[') {
			return this.readList();
		} else {
			this.skipSpaces();
			return this.readAtom();
		}
	}

	readList() {
		if (this.peek() === '[') {
			this.next();
		} else {
			return this.readAtom();
		}
		let ret = [];
		while (true) {
			let el = this.readAtom();
			if (this.peek() === ',') {
				this.next();
			} else if (this.peek() === ']') {
				ret.push(el);
				this.next();
				break;
			} else {
				throw 'Excpected a comma or end of list.';
			}
			ret.push(el);
		}
		return tok('list', ret);
	}

	readProperty() {
		this.skipSpaces();
		let id = this.readIdentifier();
		if (id.value === '') {
			throw 'Invalid identifier.';
		}
		this.skipSpaces();
		if (this.expect(/=/, 'Expected an equals symbol.')) {
			this.next();
			this.skipSpaces();
			let value = this.readAtom();
			return tok('prop', { name: id.value, value: value.value });
		}
	}

	readStick() {
		this.skipSpaces();
		let id = this.readIdentifier();
		if (id.value.toLowerCase() !== 'stick') {
			throw 'Invalid identifier. Expected \'stick\'.';
		}

		if (this.expect(/\(/, 'Expected a left-paren.')) {
			this.next();
			let props = {};
			while (true) {
				let prop = this.readProperty();
				if (this.peek() === ',') {
					this.next();
				} else if (this.peek() === ')') {
					props[prop.value.name] = prop.value.value;
					this.next();
					this.skipSpaces();
					break;
				} else {
					throw 'Excpected a comma or end of stick.';
				}
				props[prop.value.name] = prop.value.value;
			}
			return props;
		}
	}

	/**
	 * 
	 * @param {Stick} root 
	 */
	parse(root) {
		let stk = this.readStick();
		let ob = new Stick();

		if (!stk.name) throw 'Expected a stick name.';

		ob.name = stk.name;
		ob.x = stk.x || 0;
		ob.y = stk.y || 0;
		ob.rotation = stk.rotation || 0;
		ob.width = stk.width || 12;
		ob.length = stk.length || 0;
		ob.shape = stk.shape || 'line';
		ob.color = stk.color ? stk.color.map(function (e) { return e.value }) : [0,0,0];
		ob.ik = stk.ik || 0;
		ob.bendy = stk.bendy || 0;

		if (root) {
			root.children.push(ob);
			ob.parent = root;
		}

		if (this.peek() === '{') {
			this.next();
			this.skipSpaces();

			while (this.peek() !== '}') {
				this.parse(ob);
			}

			if (this.expect(/\}/, 'Expected closing bracket.')) {
				this.next();
				this.skipSpaces();
			}
		}

		return ob;
	}

}

function Vec2(x, y) {
	this.x = x instanceof Vec2 ? x.x : x;
	this.y = x instanceof Vec2 ? x.y : y;
	this.length = function() {
		return Math.sqrt(this.x * this.x + this.y * this.y);
	};
	this.normalized = function() {
		let len = this.length();
		return new Vec2(this.x / len, this.y / len);
	};

	/**
	 * @param {Vec2} b
	 */
	this.sub = function(b) {
		return new Vec2(this.x - b.x, this.y - b.y);
	};
	/**
	 * @param {Vec2} b
	 */
	this.add = function(b) {
		return new Vec2(this.x + b.x, this.y + b.y);
	};
	/**
	 * @param {number} b
	 */
	this.mul = function(b) {
		return new Vec2(this.x * b, this.y * b);
	};

	this.lerp = function(b, t) {
		return new Vec2(
			Math.lerp(this.x, b.x, t),
			Math.lerp(this.y, b.y, t)
		);
	};
}

class StickView {
	constructor(canvas) {
		/** @type {HTMLCanvasElement} */
		this.canvas = canvas instanceof HTMLCanvasElement ? canvas : document.getElementById(canvas);

		/** @type {CanvasRenderingContext2D} */
		this.ctx = this.canvas.getContext('2d');

		/** @type {Stick} */
		this.selected = null;

		/** @type {Stick} */
		this.selectedStick = null;

		/** @type {Array<Stick>} */
		this.sticks = [];

		this.moving = false;
		this.currentFrame = 0;

		let px = 0;
		let py = 0;
		let segments = null;
		let self = this;
		this.canvas.addEventListener('mousedown', function(e) {
			let rec = self.canvas.getBoundingClientRect();
			let mx = e.clientX - rec.left;
			let my = e.clientY - rec.top;
			px = mx;
			py = my;

			let hitSmth = false;
			for (let s of self.sticks) {
				for (let c of s.allChildren) {
					let p = c.parent !== null ? [c.tipX, c.tipY] : [c.globalX, c.globalY];
					let dx = p[0] - mx,
						dy = p[1] - my;
					let dist = Math.sqrt(dx * dx + dy * dy);
					if (dist < SELECTOR_RADIUS + 1) {
						self.selectedStick = c;
						self.selected = c.root;
						if (c.ik > 0) {
							segments = _ikNodes(c);
						}
						hitSmth = true;
						self.moving = true;
						break;
					}
				}
			}
			if (!hitSmth) {
				self.selected = null;
				self.selectedStick = null;
				segments = null;
			}
			self.redraw();
		});

		this.canvas.addEventListener('mouseup', function(e) {
			self.moving = false;
		});

		this.canvas.addEventListener('mousemove', function(e) {
			let rec = self.canvas.getBoundingClientRect();
			let mx = e.clientX - rec.left;
			let my = e.clientY - rec.top;

			if (self.moving && !self.selected.animationMode) {
				if (self.selectedStick.parent !== null) {
					if (self.selectedStick.ik <= 0) {
						let dx = self.selectedStick.globalX - mx;
						let dy = self.selectedStick.globalY - my;
						let da = Math.atan2(dy, dx) + Math.PI;
						let prot = self.selectedStick.parent.globalRotation;
						self.selectedStick.rotation = da - prot;
					} else {
						if (segments !== null) {
							_fabrik(segments, new Vec2(mx, my));
							_transferIK(self.selectedStick, segments);
						}
					}
				} else {
					self.selectedStick.x = mx;
					self.selectedStick.y = my;
				}
				self.redraw();
			}

			px = mx;
			py = my;
		});
	}

	redraw() {
		let frame = this.currentFrame;

		this.ctx.fillStyle = 'white';
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

		for (let s of this.sticks) {
			if (s.isAnimating()) continue;
			s.renderGhost(this.ctx, frame);
		}

		for (let s of this.sticks) {
			s.render(this.ctx);
		}

		if (this.selected !== null && !this.selected.animationMode) {
			this.selected.renderSelector(this.ctx);
		}
	}
}

const KEYFRAME_CELL_WIDTH = 11;
const KEYFRAME_CELL_HEIGHT = 20;
class Timeline {
	constructor(parent) {
		this.canvas = document.createElement('canvas');
		this.canvas.height = 0;
		
		let par = typeof(parent) === "string" ? document.getElementById(parent) : parent;
		par.appendChild(this.canvas);

		this.ctx = this.canvas.getContext('2d');

		this.maxFrames = 100;
		this.frameRate = 24;
		this._frame = 0;

		this._intervalHandle = null;

		this.canvas.width = this.maxFrames * KEYFRAME_CELL_WIDTH + 100.0;

		/** @type {Array<Stick>} */
		this._sticks = [];

		let self = this;
		let drag = false;
		this._clickAreaX = 0;
		this.canvas.addEventListener('mousedown', function(e) {
			let rec = self.canvas.getBoundingClientRect();
			let mx = (e.clientX - rec.left) - self._clickAreaX;

			self.frame = Math.min(Math.max(~~(mx / KEYFRAME_CELL_WIDTH), 0), self.maxFrames-1);

			for (let s of self._sticks) {
				s.animate(self._frame);

				s.rotation = s.animatedValues.rotation;
				s.x = s.animatedValues.x;
				s.y = s.animatedValues.y;
			}

			if (self.onplayback) {
				self.onplayback(self._frame);
			}

			drag = true;
		});

		this.canvas.addEventListener('mouseup', function(e) { drag = false; });
		this.canvas.addEventListener('mouseleave', function(e) { drag = false; });

		this.canvas.addEventListener('mousemove', function(e) {
			if (drag) {
				let rec = self.canvas.getBoundingClientRect();
				let mx = (e.clientX - rec.left) - self._clickAreaX;

				self.frame = Math.min(Math.max(~~(mx / KEYFRAME_CELL_WIDTH), 0), self.maxFrames-1);

				for (let s of self._sticks) {
					s.animate(self._frame);
	
					s.rotation = s.animatedValues.rotation;
					s.x = s.animatedValues.x;
					s.y = s.animatedValues.y;
				}

				if (self.onplayback) {
					self.onplayback(self._frame);
				}
			}
		});

		this.onplayback = null;
	}

	play() {
		this.stop();

		for (let s of this._sticks) {
			s.animationMode = true;
		}

		let self = this;
		this._intervalHandle = setInterval(function() {
			if (self.onplayback) {
				self.onplayback(self._frame);
			}
			for (let s of self._sticks) {
				s.animate(self._frame);
			}
			self._frame++;
			self._frame %= self.maxFrames;
			self.frame = Math.min(Math.max(self._frame, 0), self.maxFrames-1);
		}, 1000 / this.frameRate);
	}

	stop() {
		if (this._intervalHandle) {
			clearInterval(this._intervalHandle);
			this._intervalHandle = null;
		}
		for (let s of this._sticks) {
			s.animationMode = false;
		}
		this.frame = 0;
		if (this.onplayback) {
			this.onplayback(0);
		}
		this.redraw();
	}

	playStop() {
		if (this._intervalHandle) {
			this.stop();
		} else {
			this.play();
		}
	}

	toggleKeyframe() {
		for (let s of this._sticks) {
			s.insertKeyframe(new KeyFrame(this._frame, s.rotation, s.x, s.y));
		}
		this.redraw();
	}

	get frames() {
		return this.maxFrames;
	}

	set frames(f) {
		this.maxFrames = f;
		this.canvas.width = f * KEYFRAME_CELL_WIDTH + 100.0;
		this.redraw();
	}

	get frame() {
		return this._frame;
	}

	set frame(f) {
		this._frame = f;
		this.redraw();
	}

	get sticks() {
		return this._stick;
	}

	/** @param {Stick} s */
	set sticks(s) {
		this._sticks = s.allChildren;
		this.canvas.height = (this._sticks.length+1) * KEYFRAME_CELL_HEIGHT;
		this.redraw();
		this.redraw();
	}

	redraw() {
		let ctx = this.ctx;
		ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

		let offy = KEYFRAME_CELL_HEIGHT, offx = -1;

		for (let s of this._sticks) {
			offx = Math.max(offx, ctx.measureText(s.name).width);
		}
		offx += 32;
		this._clickAreaX = offx;

		let viewHeight = this._sticks.length * KEYFRAME_CELL_HEIGHT;
		let limitX = this._clickAreaX + this.maxFrames * KEYFRAME_CELL_WIDTH;

		ctx.fillStyle = "#ccc";
		ctx.fillRect(0, KEYFRAME_CELL_HEIGHT, offx, viewHeight);
		ctx.fillRect(0, 0, this.canvas.width, KEYFRAME_CELL_HEIGHT);

		ctx.fillStyle = "rgba(0, 100, 255, 0.5)";
		ctx.fillRect(this.frame * KEYFRAME_CELL_WIDTH + offx, KEYFRAME_CELL_HEIGHT, KEYFRAME_CELL_WIDTH, viewHeight);

		ctx.font = '12px Arial';
		ctx.textBaseline = 'middle';

		let frameTextX = 0;
		let frameText = 'F ' + (this.frame+1);
		let frameTextWidth = ctx.measureText(frameText).width + 10;
		let calcX = this.frame * KEYFRAME_CELL_WIDTH + offx;
		if (calcX + frameTextWidth >= limitX) {
			frameTextX = -frameTextWidth + KEYFRAME_CELL_WIDTH;
		}

		ctx.fillStyle = "rgba(0, 100, 255, 0.5)";
		ctx.fillRect(calcX + frameTextX, 0, frameTextWidth, KEYFRAME_CELL_HEIGHT);

		ctx.fillStyle = 'black';
		ctx.fillText(frameText, calcX + 5 + frameTextX, KEYFRAME_CELL_HEIGHT / 2 + 1);
		ctx.fillStyle = 'white';
		ctx.fillText(frameText, calcX + 5 + frameTextX, KEYFRAME_CELL_HEIGHT / 2);

		ctx.font = '18px Arial';
		ctx.textBaseline = 'top';

		let first = false;
		for (let s of this._sticks) {
			let m = ctx.measureText(s.name);
			ctx.fillStyle = '#555';

			ctx.fillText(s.name, offx - (m.width+8), offy + 2);

			for (let i = 0; i < this.maxFrames; i++) {
				let kf = s.getKeyframe(i);

				let x = i * KEYFRAME_CELL_WIDTH + offx;
				let y = offy;

				if ((i+1) % 2 === 0 && !first) {
					ctx.beginPath();
					ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
					ctx.rect(x, KEYFRAME_CELL_HEIGHT, KEYFRAME_CELL_WIDTH, viewHeight);
					ctx.fill();
				}

				if (kf) {
					ctx.beginPath();
					ctx.fillStyle = 'blue';
					ctx.arc(x + KEYFRAME_CELL_WIDTH / 2, y + KEYFRAME_CELL_HEIGHT / 2, KEYFRAME_CELL_WIDTH / 2.5, 0, Math.PI * 2);
					ctx.fill();
				}
			}
			first = true;

			ctx.beginPath();
			ctx.lineWidth = 0.6;
			ctx.strokeStyle = '#777';
			ctx.moveTo(0, offy);
			ctx.lineTo(this.canvas.width, offy);
			ctx.stroke();

			offy += KEYFRAME_CELL_HEIGHT;
		}

		ctx.beginPath();
		ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
		ctx.rect(limitX, 0, 1000, 1000);
		ctx.fill();

		ctx.beginPath();
		ctx.lineWidth = 0.6;
		ctx.strokeStyle = '#777';
		ctx.rect(0, 0, this.canvas.width, (this._sticks.length+1) * KEYFRAME_CELL_HEIGHT);
		ctx.stroke();
	}
}