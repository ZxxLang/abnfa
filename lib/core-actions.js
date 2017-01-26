// function handling(dst, bare, actions, option)

var buffer = [];

function get() {
	return buffer.pop() || Object.create(null);
}

function put(n) {
	buffer.push(n)
}

module.exports = Actions

function Actions(inputSourceOrRules) {
	if (typeof inputSourceOrRules == 'string')
		this.src = inputSourceOrRules
	else if (inputSourceOrRules)
		this.rules = inputSourceOrRules
}

Actions.prototype.parse = function parse(inputSource) {
	this.src = inputSource
	return this.retrans(this.rules)
}

Actions.prototype.retrans = function retrans(rules) {
	if (null == rules) return null
	this.pos = 0
	this.last = null
	this.list = []

	this.rules = rules
	return this.repeat(rules.defs[rules.first]) && this.list ||
		new Error('Actions retrans failed')
}

Actions.prototype.ref = function ref(n) {
	var len, last = this.last,
		start = this.pos,
		rule = this.rules.defs[n.ref],
		produce = rule && n.action && n.action.produce && get() || null;

	if (produce) {
		if (last) this.list.push(null);
		this.list.push(produce);
	}

	len = this.list.length

	if (!rule || !this.repeat(rule)) {
		if (produce) {
			if (last) this.list.pop();;
			put(produce);
			this.list.pop();
		}
		return false
	}

	// discard
	if (!n.action) return true

	if (produce) {
		this.last = produce
		produce.start = start
		produce.end = this.pos
		produce.action = n.action;
		// r = nums-Number-term
		// nums = 1*(DIGIT)
		if (len == this.list.length && start != this.pos)
			produce.raw = this.src.slice(start, this.pos)
		return true
	}

	last = this.last;
	if (last && last.action.method == 'term' &&
		n.action.method == 'term' &&
		last.action.produce == n.action.produce &&
		last.action.property == n.action.property &&
		last.action.extra == n.action.extra) {
		last.end = this.pos
		last.raw += this.src.slice(start, this.pos)
	} else {
		this.last = get()
		this.last.start = start
		this.last.end = this.pos
		if (len == this.list.length && start != this.pos)
			this.last.raw = this.src.slice(start, this.pos)
		this.last.action = n.action
		this.list.push(this.last)
	}

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