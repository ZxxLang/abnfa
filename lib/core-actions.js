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
	this.list = []
}

Actions.prototype.match = function match() {
	return this.repeat(this.rules.defs[this.rules.first]) &&
		this.list.filter(function(n) {
			return n && n.end > n.start
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

Actions.prototype.ref = function ref(n) {
	var prev, produce, next, merge, raw,
		start = this.pos,
		action = n.action,
		rule = this.rules.defs[n.ref],
		len = this.list.length;

	prev = len && this.list[len - 1] || null;

	merge = prev && action && (
		action.method == 'term' && !action.produce && !action.key && prev.action.produce ||
		prev.action.method == 'to' && !prev.action.produce && action.produce ||
		!prev.action.produce && !action.produce &&
		prev.action.method == action.method &&
		prev.action.key == action.key &&
		prev.action.flag == action.flag
	) && true || false

	produce = rule && (!merge || action && action.produce) && action && get() || null;

	if (produce) {
		produce.action = action;
		produce.start = start
		produce.end = 0
		this.list.push(produce);
	}

	if (!rule || !this.repeat(rule)) {
		pop(this.list, len);
		return false
	}

	// discard
	if (!action || start == this.pos) {
		pop(this.list, len);
		return true
	}

	raw = this.src.slice(start, this.pos)


	if (merge) {
		prev.action = copyAction(prev.action)

		if (prev.end < this.pos) prev.end = this.pos
		if (action.method == 'term' || action.method == 'mix' ||
			prev.action.method != 'to') {

			prev.raw = (prev.raw || '') + raw
		} else {
			if (action.produce) prev.action.produce = action.produce;
			if (action.key) prev.action.key = action.key;
			if (action.flag) prev.action.flag = action.flag;
		}
		return true
	}

	next = len != this.list.length && this.list[len + 1] || null;

	produce.start = start
	produce.end = this.pos
	if (!produce.raw && (!next || produce.end <= next.start))
		produce.raw = raw

	produce.action = copyAction(produce.action);

	if (len + 2 == this.list.length &&
		next.start == start && next.end == this.pos) {

		// next must be a terminator
		if (!produce.raw) produce.raw = raw;
		this.list.pop();
	}

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