"use strict"
var PREFIX = 1,
	SUFFIX = 2,
	INFIX = 4;

module.exports = Actions

function Actions(inputSourceOrRules, plugins) {

	this.plugins = plugins || Object.create(null);
	if (typeof inputSourceOrRules == 'string') {
		this.src = inputSourceOrRules
	} else if (inputSourceOrRules) {
		this.rules = inputSourceOrRules
		this.infixes = Object.create(null)
	}
	this.init()
}

Actions.prototype.init = function init() {
	this.pos = 0
	this.list = []
	this.flags = 0;
	this.stack = []
}

Actions.prototype.parse = function parse(inputSource) {
	this.src = inputSource
	this.init()
	return this.play(this.rules.first)
}

Actions.prototype.retrans = function retrans(rules) {
	if (null == rules) return null
	this.rules = rules
	this.infixes = Object.create(null)
	this.init()
	return this.play(rules.first)
}

Actions.prototype.branch = function branch() {
	this.stack.push(this.list, this.flags)
	this.list = []
	this.flags = 0;
}

Actions.prototype.revert = function revert() {
	this.flags = this.stack.pop() || 0
	this.list = this.stack.pop() || []
}

Actions.prototype.play = function play(first) {
	if (!this.rules || !this.repeat(this.rules.defs[first]))
		return new Error('Actions retrans failed');
	return this.merge() || new Error('Actions grouping failed');
}

Actions.prototype.merge = function merge() {
	var list = this.list;
	list.sort(PositionASC)

	buildFactors(list)
	list = list.filter(non)
	shrinkFactors(list)

	if (this.flags & INFIX) {
		buildInfix(list)
		list = list.filter(non)
	}

	this.revert()
	return list
}


function echo(list, a) {
	console.log('...... \n', JSON.stringify(a))
	a = []
	list && list.forEach(function(n, i) {
		console.log('\n', i, '\t', JSON.stringify(n))
	})
}

function non(n) {
	return !!n
}


function leftToRight(a, b) {
	return a[1] < b[1] && 1 ||
		a[1] > b[1] && -1 ||
		a[0] < b[0] && -1 ||
		a[0] > b[0] && 1 || 0
}

function PositionASC(a, b) {
	if (!a || !b) return 0
	return a.start < b.start && -1 ||
		a.start > b.start && 1 ||
		a.end > b.end && -1 || 1
}

function shrinkFactors(list) {
	var n, o, i;
	for (i = 0; i < list.length; i++) {
		n = list[i]
		if (!n || !n.factors || n.factors.length != 1) continue

		o = n.factors[0]
		list[i] = o
		if (n.key && !o.key) o.key = n.key
		if (n.extra && !o.extra) o.extra = n.extra
	}
}

function buildFactors(list) {
	var i, p, c;
	for (i = 0; i < list.length;) {
		p = list[i++]
		if (!p || p.factors) continue
		if (p.method == 'infix') {
			while (i < list.length) {
				c = list[i++]
				if (!c || p.start <= c.start && p.end >= c.end)
					continue
				break
			}
			continue
		}
		oneFactors(p, list, i)
	}
}

function oneFactors(p, list, i) {
	var c, factors = [];
	while (i < list.length) {
		c = list[i++]
		if (!c) continue
		if (p.start <= c.start && p.end >= c.end) {
			factors.push(c)
			list[i - 1] = null
			continue
		}
		break
	}
	if (factors.length) p.factors = factors
}

function buildInfix(list) {
	var a = [];
	//return list
	return list && list.every(function(n, i) {
		if (n && n.precedence) this.push([i - 1, n.precedence])
		return true
	}, a) && a.length && a.sort(leftToRight).every(function(a) {
		var o, s, i = a[0],
			n = this[i];

		while (i)
			if (this[--i]) break;

		o = this[i] //left
		this[i] = null
		n.start = o.start

		s = o.method || ''
		o.method = 'to'
		n.method = s

		s = o.key || ''
		o.key = n.key
		n.key = s

		i = a[0] + 1
		n.factors = [o, this[i], null]
		this[i] = null

		for (i++; i < this.length; i++)
			if (this[i]) {
				n.factors[2] = this[i]
				this[i] = null
				return true
			}

		return false

	}, list) || !a.length
}

Actions.prototype.precedence = function precedence(rule, raw) {
	// results precedence for infix operator, and greedy match
	var i, a = this.infixes[rule.name];
	if (!a) {
		a = this.infixes[rule.name] = []
		rule.alts.forEach(function(n, i) {
			i++
			n.alts.forEach(function(n) {
				a.push([n.raw, i])
			});
		})

		a.sort(function(a, b) {
			return a[0].length > b[0].length && -1 || 1;
		})
	}

	for (i = 0; i < a.length; i++)
		if (a[i][0] == raw) return a[i][1]
	return 0
}

Actions.prototype.create = function create(n, start, raw) {
	var a = Object.create(null);
	a.start = start
	a.end = this.pos
	if (n) {
		if (raw) a.raw = this.src.slice(start, this.pos);
		if (n.type) a.type = n.type;
		if (n.method) a.method = n.method;
		if (n.key) a.key = n.key;
		if (n.extra) a.extra = n.extra;
	}
	return a
}

function nextOperand(list, i) {
	for (; i < list.length; i++) {
		if ('mark' == list[i].method) continue;
		if ('lit' == list[i].method ||
			'precedence' == list[i].method)
			break
		return -1
	}

	for (i++; i < list.length; i++) {
		if ('mark' == list[i].method) continue;
		return i;
	}
	return -1
}

Actions.prototype.action = function action(n) {
	var asso, list,
		i = this.list.length,
		start = this.pos,
		rule = this.rules.defs[n.ref];

	if (n.method == 'prefix') {
		if (!this.repeat(rule) || i == this.list.length) return false
		if (start == this.pos) return true

		// must maintain the original order
		asso = this.create(n, start, false)
		list = this.list.slice(i).sort(PositionASC)
		start = nextOperand(list, 0)

		if (start < 1 ||
			list[start].mehtod == 'infix' ||
			list[start].mehtod == 'ahead') return false

		oneFactors(list[start], list, start + 1)

		asso.end = list[start].end
		asso.factors = []

		list = this.list

		for (; i < list.length; i++) {
			if (asso.start <= list[i].start && asso.end >= list[i].end) {
				asso.factors.push(list[i])
				list[i] = null
				if (!start) break
				start--
			}
		}
		this.list = list.filter(non)
		this.list.push(asso)
		return true
	}

	if (n.method == 'infix') {
		if (!this.repeat(rule) || i == this.list.length) return false
		if (start == this.pos) return true

		list = this.list.slice(i).sort(PositionASC)
		i = nextOperand(list, 0)

		if (i < 1) return false

		this.flags |= INFIX

		asso = this.create(n, start, false)
		asso.end = list[i].end
		this.list.push(asso)
		return true
	}

	if (n.method == 'precedence') {
		if (!this.repeat(rule)) return false;

		if (start == this.pos) return true;

		asso = this.create(n, start, true);
		asso.precedence = this.precedence(rule, asso.raw)
		if (!asso.precedence) return false
		this.list.push(asso)
		return true
	}

	if (n.method == 'lit') {
		if (!this.repeat(rule)) return false;

		if (start == this.pos) return true;

		asso = i && this.list[i - 1] || null

		if (asso && asso.raw && asso.type == n.type &&
			asso.method == n.method &&
			asso.key == n.key) {
			asso.raw += this.src.slice(start, this.pos);
			asso.end = this.pos
			return true
		}

		this.list.push(this.create(n, start, true));
		return true
	}

	// alone
	if (n.method == 'alone') {
		this.branch();
		if (!this.repeat(rule)) {
			this.revert()
			return false
		}

		if (start == this.pos) {
			this.revert()
			return true
		}

		asso = this.create(n, start, false);
		asso.factors = this.merge()
		this.list.push(asso)
		return true
	}

	if (n.method == 'inner') {
		if (!this.repeat(rule) || i == this.list.length) return false
		if (start == this.pos) return true

		if (n.key) {
			list = this.list.slice(i).sort(PositionASC)
			list[0].key = n.key
		}

		return true
	}

	list = this.list
	if (!this.repeat(rule)) return false

	if (start != this.pos && i != list.length) {
		asso = list[i]
		if (asso && n.type && asso.raw &&
			!asso.type && !asso.key && !asso.extra) {
			// num   = digit-Number
			// digit = 1*DIGIT--lit
			list[i] = this.create(n, start, false)
			list[i].raw = asso.raw;
			return true
		}
	}

	list.push(this.create(n, start, false))

	return true
}

Actions.prototype.repeat = function repeat(n) {
	var c = 0,
		i = this.pos,
		//len = this.list.length,
		max = !n.rep && 1 || n.rep.max || -1,
		method = n.ref && (this.plugins[n.ref] && Plugin ||
			!n.tail && Ref || this.action) ||
		n.alts && Choice ||
		n.seqs && Serial ||
		n.raw && Text ||
		n.first && Range ||
		n.fields && Binary || null;

	if (!method) return false

	while (c != max && this.pos < this.src.length && method.call(this, n))
		c++;

	if (c >= (!n.rep && 1 || n.rep.min || 0)) return true;

	//while (len < this.list.length) this.list.pop();

	this.pos = i

	return false
}

function Plugin(n) {
	return this.plugins[n.ref](n, this)
}

function Ref(n) {
	return this.repeat(this.rules.defs[n.ref]) && true || false
}

function Choice(n) {
	return n.alts.some(function(n) {
		return this.repeat(n)
	}, this);
}

function Serial(n) {
	return n.seqs.every(function(n) {
		return this.repeat(n)
	}, this);
}

function Text(n) {
	if (this.src.substr(this.pos, n.raw.length) != n.raw) return false
	this.pos += n.raw.length;
	return true
}

function Range(n) {
	var code = this.src.charCodeAt(this.pos).toString(n.radix)
	if (code < n.first || code > n.last) return false
	this.pos++;
	return true
}

function Binary(n) {
	return n.fields.every(function(raw, i) {
		return this.src.charCodeAt(this.pos + i).toString(n.radix) == raw
	}, this) && (this.pos += n.fields.length) && true || false
}