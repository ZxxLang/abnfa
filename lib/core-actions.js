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
	}
	this.reset()
}

Actions.prototype.reset = function reset() {
	this.pos = 0
	this.group = 0
	this.list = []
}

Actions.prototype.match = function match() {
	if (!this.repeat(this.rules.defs[this.rules.first]))
		return new Error('Actions retrans failed');

	//return this.list
	this.list = this.list.filter(function(n, i) {
		return !!n
	}, this)
	return this.list
}

Actions.prototype.parse = function parse(inputSource) {
	this.src = inputSource
	this.reset()
	return this.match()
}

Actions.prototype.retrans = function retrans(rules) {
	if (null == rules) return null
	this.rules = rules
	this.reset()
	return this.match()
}

function same(a, b) {
	return a.produce == b.produce &&
		a.method == b.method &&
		a.key == b.key &&
		a.flag == b.flag
}

function echo(list, a) {
	console.log('...... \n', JSON.stringify(a))
	a = []
	list.forEach(function(n, i) {
		console.log('\n', i, '\t', JSON.stringify(n))
	})
}

Actions.prototype.produce = function produce(action, start, raw) {
	var n = Object.create(null);
	n.group = this.group;
	n.start = start
	n.end = this.pos
	if (!action) {
		n.method = 'group'
		return n
	}

	if (raw) n.raw = this.src.slice(start, this.pos);
	if (action.produce) n.produce = action.produce;
	if (action.method) n.method = action.method;
	if (action.key) n.key = action.key;
	if (action.flag) n.flag = action.flag;
	return n
}

Actions.prototype.ref = function ref(n) {
	var produce, asso, //associate
		x, i = this.list.length,
		start = this.pos,
		action = n.action,
		rule = this.rules.defs[n.ref];

	if (!rule) return false;

	x = action &&
		(action.produce || action.method && action.method != 'lit') &&
		1 || 0;

	if (action && action.method == 'group')
		this.group++;

	if (x) this.list.push(null); // placeholder

	if (!this.repeat(rule)) {
		if (action && action.method == 'group')
			this.group--;
		if (x) this.list.pop();
		return false
	}

	if (!action) return true; // refname only

	if (action && action.method == 'group') {
		this.group--;
		this.list[i] = this.produce(null, start, false);
		return true;
	}

	if (start == this.pos) { // *rule || [rule]
		if (x) this.list.pop();
		return true
	}

	if (action.method == 'lit') { // [prev-last-asso] lit
		asso = i && this.list[i - 1] || null;
		if (asso && same(asso, action)) {
			asso.end = this.pos
			asso.raw += this.src.slice(start, this.pos);
		} else
			this.list.push(this.produce(action, start, true))
		return true
	}

	produce = this.produce(action, start, false);
	this.list[i] = produce;

	// backward
	x = i + 1;
	while (x < this.list.length) {
		asso = this.list[x]
		if (asso) break;
		x++
	}

	if (!asso) return true

	if (asso.raw && !asso.produce && !asso.key && asso.method == 'lit') {
		this.list[x] = null
		produce.raw = asso.raw
		if (asso.flag) produce.flag = asso.flag;
		return true
	}

	if (action.method == 'behind') {
		if (asso.group != produce.group) return false;
		this.list[i] = null

		if (action.key) asso.key = action.key
		if (action.flag) asso.flag = action.flag
		return true
	}

	if (action.method == 'ahead') {
		if (!i) return false
		x = i
		while (x) {
			this.list[x] = this.list[--x]
			asso = this.list[x]
			if (asso && asso.group == produce.group) break;
			asso = null
		}

		if (!asso) return false

		this.list[x] = produce

		if (asso.method == 'group') { // placeholder
			produce.start = asso.start
			produce.method = ''
			if (produce.key) produce.key = ''
			if (produce.flag) produce.flag = ''
			this.list[x + 1] = null
			return true
		}

		asso.method = 'to'
		produce.method = 'to'
		produce.start = asso.start
		if (asso.key) produce.key = asso.key
		if (asso.flag) produce.flag = asso.flag

		if (action.key) asso.key = action.key
		if (action.flag) asso.flag = action.flag
		return true
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

	while (len < this.list.length) this.list.pop();

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