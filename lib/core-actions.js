var buffer = [];

function get() {
	return Object.create(null) || buffer.pop() || Object.create(null);
}

function put1(n) {
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

function copyAction(action) {
	var n = Object.create(null)
	if (action.produce != null)
		n.produce = action.produce;
	if (action.method != null)
		n.method = action.method;
	if (action.property != null)
		n.property = action.property;
	if (action.extra != null)
		n.extra = action.extra;
	return n
}

Actions.prototype.ref = function ref(n) {
	var len, next,
		start = this.pos,
		action = n.action,
		rule = this.rules.defs[n.ref],
		produce = rule && action && action.produce && get() || null;

	if (produce) {
		this.list.push(produce);
	}

	len = this.list.length

	if (!rule || !this.repeat(rule)) {
		if (produce) {
			//put(produce);
			this.list.pop();
		}
		return false
	}

	// discard
	if (!action) return true

	if (produce) {
		produce.start = start
		produce.end = this.pos
		produce.action = copyAction(action);

		// r = nums-Number-term
		// nums = 1*(DIGIT)
		if (len == this.list.length && start != this.pos)
			produce.raw = this.src.slice(start, this.pos)
		this.list.push(null)
		return true
	}

	next = this.list[len];
	// merge term
	if (next && action.method == 'term' &&
		next.action.method == 'term' &&
		next.action.produce == action.produce &&
		next.action.property == action.property &&
		next.action.extra == action.extra) {
		next.end = this.pos
		next.raw += this.src.slice(start, this.pos)
		return true
	}
	// mix property
	if (next && !action.produce && next.action.produce &&
		action.property && !next.action.property &&
		(!action.method || !next.action.method) &&
		(!action.extra || !next.action.extra)) {

		if (action.method && !next.action.method)
			next.action.method = action.method;
		next.action.property = action.property;
		if (action.extra && !next.action.extra)
			next.action.extra = action.extra;
		return true
	}
	// insert
	produce = get()
	produce.start = start
	produce.end = this.pos
	produce.action = copyAction(action);

	if (len == this.list.length && start != this.pos) {
		produce.raw = this.src.slice(start, this.pos)
		this.list.push(produce)
		return true
	}
	this.list.push(null)
	var i = this.list.length - 1;
	while (i > len) this.list[i] = this.list[--i];
	this.list[len] = produce
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