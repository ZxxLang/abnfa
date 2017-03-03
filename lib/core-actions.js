"use strict"
var buffer = [];

function get() {
	return buffer.pop() || Object.create(null);
}

function pop(list, len) {
	while (len != list.length) buffer.push(list.pop())
}

module.exports = Actions

function Actions(inputSourceOrRules) {
	if (typeof inputSourceOrRules == 'string') {
		this.src = inputSourceOrRules
	} else if (inputSourceOrRules) {
		this.rules = inputSourceOrRules
		this.init()
	}
	this.reset()
}

Actions.prototype.init = function init() {
	var self = this,
		precedences = this.rules.defs.PRECEDENCES;

	this.precSensitive = true
	this.precedences = []

	if (!precedences) return;

	precedences.alts.forEach(function(r) {
		this.push(r.seqs.map(function(text) {
			self.precSensitive = self.precSensitive && text.formal != 'i';
			return text.raw
		}))
	}, this.precedences)
}

Actions.prototype.reset = function reset() {
	this.pos = 0
	this.mix = -1
	this.list = []
}

Actions.prototype.match = function match() {
	return this.repeat(this.rules.defs[this.rules.first]) &&
		this.list.filter(function(n) {
			return true || n && (n.end > n.start || n.action.method == 'alter')
		}) ||
		new Error('Actions retrans failed')
}

Actions.prototype.parse = function parse(inputSource) {
	this.src = inputSource
	this.reset()
	return this.match()
}

Actions.prototype.retrans = function retrans(rules) {
	if (null == rules) return null
	this.rules = rules
	this.init()
	this.reset()
	return this.match()
}

function copyAction(action) {
	var n = Object.create(null)
	if (action.produce) n.produce = action.produce;
	if (action.method) n.method = action.method;
	if (action.key) n.key = action.key;
	if (action.flag) n.flag = action.flag;
	return n
}

function same(a, b) {
	return a.produce == b.produce &&
		a.method == b.method &&
		a.key == b.key &&
		a.flag == b.flag
}

Actions.prototype.produce = function produce(action, start) {
	var n = Object.create(null);
	n.action = copyAction(action);
	n.start = start
	n.end = this.pos
	n.raw = this.src.slice(start, this.pos)
	return n
}

Actions.prototype.ref = function ref(n) {
	var prev, idx, produce,
		start = this.pos,
		action = n.action,
		rule = this.rules.defs[n.ref];

	if (!rule || !this.repeat(rule)) return false;

	if (!action || start == this.pos) return true;

	prev = this.list.length && this.list[this.list.length - 1] || null;

	if (action.method == 'alter') {
		produce = Object.create(null)
		produce.action = Object.create(null);
		produce.action.produce = action.produce;
		idx = this.list.length
		if (idx) {
			this.list.push(null);
			while (idx) {
				this.list[idx] = this.list[--idx];
				prev = this.list[idx];
				if (prev.action.produce) {
					produce.action.method = 'to'
					if (action.key == 'key') {
						produce.action.key = prev.action.key
						prev.action.key = action.flag
					} else {
						produce.action.flag = prev.action.flag
						prev.action.flag = action.flag
					}
					this.list[idx] = produce
					return true
				}
			}
		}
	}

	// reverse
	if (prev && prev.start == start && prev.end == this.pos) {
		if (action.produce) {
			if (!prev.action.produce) prev.action.produce = action.produce;
			if (prev.action.method == 'term') prev.action.method = '';
			if (action.method && action.method != 'term')
				prev.action.method = action.method;
			if (action.key) prev.action.key = action.key;
			if (action.flag) prev.action.flag = action.flag;
			return true
		}

		if (action.method && !prev.action.method)
			prev.action.method = action.method
		if (action.key && !prev.action.key)
			prev.action.key = action.key
		if (action.flag && !prev.action.flag)
			prev.action.flag = action.flag
		return true
	}

	if (prev && (action.method == 'term' || action.method == 'mix') &&
		same(action, prev.action)) {
		prev.end = this.pos
		prev.raw = (prev.raw || '') + this.src.slice(start, this.pos);
		return true
	}

	produce = this.produce(action, start);

	if (prev && prev.start >= start && prev.end <= this.pos) {
		if (produce.raw) produce.raw = ''
		idx = this.list.length
		this.list.push(null);
		while (idx) {
			this.list[idx] = this.list[--idx]
			prev = this.list[idx]
			if (prev.end <= start) break;
		}
		this.list[idx] = produce
		return true
	}

	this.list.push(produce);
	return true
}

Actions.prototype.repeat = function repeat(n) {
	var min = !n.rep && 1 || n.rep.min || 0,
		max = !n.rep && 1 || n.rep.max || -1,
		c = 0,
		i = this.pos,
		len = this.list.length,
		method = n.alts && this.alts ||
		n.seqs && this.seqs ||
		n.raw && this.text ||
		n.first && this.range ||
		n.fields && this.binary ||
		n.ref && this.ref;

	while (c != max && this.pos < this.src.length && method.call(this, n))
		c++;

	if (c >= min) return true;
	this.pos = i
	return false
}

Actions.prototype.alts = function alts(n) {
	return n.alts.some(function(n) {
		return this.repeat(n)
	}, this);
}

Actions.prototype.seqs = function seqs(n) {
	return n.seqs.every(function(n) {
		return this.repeat(n)
	}, this);
}

Actions.prototype.text = function text(n) {
	if (this.src.substr(this.pos, n.raw.length) != n.raw) return false
	this.pos += n.raw.length;
	return true
}

Actions.prototype.range = function range(n) {
	var code = this.src.charCodeAt(this.pos).toString(n.radix)
	if (code < n.first || code > n.last) return false
	this.pos++;
	return true
}

Actions.prototype.binary = function binary(n) {
	return n.fields.every(function(raw, i) {
		return this.src.charCodeAt(this.pos + i).toString(n.radix) == raw
	}, this) && (this.pos += n.fields.length) && true || false
}