var buffer = [];

function get() {
	return buffer.pop() || Object.create(null);
}

function pop(list, n) {
	if (n) {
		buffer.push(n)
		list.pop()
	}
}

module.exports = Actions

function Actions(inputSourceOrRules) {
	this.precSensitive = true
	this.precedences = []

	if (typeof inputSourceOrRules == 'string')
		this.src = inputSourceOrRules
	else if (inputSourceOrRules) {
		this.rules = inputSourceOrRules
		this.init()
	}
}

Actions.prototype.init = function init() {
	var self, precedences = this.rules.defs.PRECEDENCES
	if (!precedences) return;
	self = this;
	precedences.alts.forEach(function(r) {
		this.push(r.seqs.map(function(text) {
			self.precSensitive = self.precSensitive && text.formal != 'i';
			return text.raw
		}))
	}, this.precedences)
}

Actions.prototype.parse = function parse(inputSource) {
	this.src = inputSource
	this.reset()
	return this.match()
}

Actions.prototype.reset = function reset() {
	this.pos = 0
	this.last = null
	this.list = []
}

Actions.prototype.match = function match() {
	return this.repeat(this.rules.defs[this.rules.first]) && this.list ||
		new Error('Actions retrans failed')
}

Actions.prototype.retrans = function retrans(rules) {
	if (null == rules) return null
	this.rules = rules
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
	var prev, produce, next, merge,
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
	)

	produce = !merge && rule && action && get() || null;

	if (produce) {
		produce.action = action
		produce.start = 0
		produce.end = 0
		this.list.push(produce);
	}

	if (!rule || !this.repeat(rule)) {
		pop(this.list, produce);
		return false
	}
	// discard
	if (!action || start == this.pos) {
		pop(this.list, produce);
		return true
	}

	raw = this.src.slice(start, this.pos)

	if (merge) {
		prev.action == copyAction(prev.action)
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

	next = len != this.list.len && this.list[len + 1] || null;

	produce.start = start
	produce.end = this.pos
	if (!produce.raw && (!next || next.action.produce))
		produce.raw = raw

	produce.action = copyAction(produce.action);
	return true
}

Actions.prototype.repeat = function repeat(n) {
	var min = !n.rep && 1 || n.rep.min,
		max = !n.rep && 1 || n.rep.max,
		c = 0,
		l = this.list.length,
		i = this.pos,
		method = n.alts && this.alts ||
		n.seqs && this.seqs ||
		n.raw && this.text ||
		n.first && this.range ||
		n.fields && this.binary ||
		n.ref && this.ref;

	while (c != max && this.pos < this.src.length && method.call(this, n))
		c++;
	if (c >= min) {
		return true;
	}
	this.pos = i
	if (l != this.list.length) this.list = this.list.slice(0, l)
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