"use strict"
var buffer = [];

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
	this.list = []
	this.group = []
}

Actions.prototype.match = function match() {
	if (!this.repeat(this.rules.defs[this.rules.first]))
		return new Error('Actions retrans failed');

	return grouping(this.list) || new Error('Actions grouping failed');
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

function echo(list, a) {
	console.log('...... \n', JSON.stringify(a))
	a = []
	list.forEach(function(n, i) {
		console.log('\n', i, '\t', JSON.stringify(n))
	})
}

function precedence(rule, operator) {
	var i, alts = rule && rule.alts;
	for (i = 0; i < alts.length; i++) {
		if (alts[i].alts.some(function(n) {
				return n.raw == operator
			})) return i + 1
	}
	return 0
}

function non(n) {
	return !!n
}

function grouping(list) {
	list = infixGrouping(unaryGrouping(list))
	if (list && list.length == 1) fixFactors(list[0])
	return list
}

function leftToRight(a, b) {
	return a[1] < b[1] && 1 ||
		a[1] > b[1] && -1 ||
		a[0] < b[0] && -1 ||
		a[0] > b[0] && 1 || 0
}

function infixGrouping(list) {
	var a = [];
	//return list
	return list && list.every(function(n, i, list) {
		if (n.factors) {
			n.factors = infixGrouping(n.factors)
			if (!n.factors) return false
			return true
		}

		if (!n.precedence) return true

		if (i < 2) return false

		this.push([i - 1, n.precedence])

		n = list[i - 1]
		if (!n.key || n.factors || n.method != 'ahead')
			return false

		n = list[i + 1]
		return n && n.key

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

		s = o.flag || ''
		o.flag = n.flag || ''
		n.flag = s

		i = a[0] + 1
		n.factors = [o, this[i], null]
		this[i] = null

		for (i++; i < this.length; i++)
			if (this[i]) {
				n.factors[2] = this[i]
				this[i] = null
				fixFactors(n.factors[0])
				fixFactors(n.factors[2])
				return true
			}

		return false

	}, list) && list.filter(non) || !a.length && list
}

function fixFactors(n) {
	var o;
	if (!n || n.type || n.raw || !n.factors || n.factors.length != 1)
		return;

	o = n.factors[0]
	if (o.raw) n.raw = o.raw
	if (o.type) n.type = o.type
	if (!n.method && o.method) n.method = o.method
	if (!n.key && o.key) n.key = o.key
	if (!n.flag && o.flag) n.flag = o.flag

	n.factors = o.factors || null
}

function unaryGrouping(list) {
	var i, clear, n, p, o;
	for (i = 0; i < list.length; i++) {
		p = list[i]
		if (p.factors) {
			p.factors = grouping(p.factors)
			if (!p.factors) return
			continue
		}
		if (p.flag != 'postfix') continue

		n = list[i - 2]
		o = list[i - 1]
		if (!n || !o || !n.type || !o.key || n.factors) return

		list[i] = null
		list[i - 1] = null

		n.factors = [p, o];
		n.end = o.end
		i++
		clear = true
	}

	list = clear && list.filter(non) || list
	clear = false

	for (i = 0; i < list.length; i++) {
		p = list[i]
		if (p.flag != 'prefix') continue

		n = list[i - 1]
		o = list[i + 1]
		if (!n || !o || !n.type || !o.key || n.factors) return

		list[i] = null
		list[i + 1] = null

		n.factors = [p, o];
		n.end = o.end
		i++
		clear = true
	}

	return clear && list.filter(non) || list
}

Actions.prototype.action = function action(action, start, raw) {
	var n = Object.create(null);
	n.start = start
	n.end = this.pos
	if (raw) n.raw = this.src.slice(start, this.pos);
	if (action.type) n.type = action.type;
	if (action.method) n.method = action.method;
	if (action.key) n.key = action.key;
	if (action.flag) n.flag = action.flag;
	return n
}

Actions.prototype.ref = function ref(n) {
	var asso, list = this.list,
		i = list.length,
		start = this.pos,
		action = n.action,
		rule = this.rules.defs[n.ref];

	if (!rule) return false;
	if (!action) return this.repeat(rule);

	// alone
	if (action.method == 'alone') {
		asso = Object.create(null);
		asso.start = start
		asso.end = 0
		asso.type = ''
		asso.method = ''
		asso.key = ''
		asso.flag = ''
		asso.factors = [];
		list.push(asso);
		this.group.push(list);
		this.list = asso.factors;
		if (this.repeat(rule)) {
			asso.end = this.pos
			this.list = this.group.pop()
			return true
		}

		list.pop()
		this.list = this.group.pop()
		return false
	}

	if (action.method == 'inner') {
		if (!this.repeat(rule)) return false
		asso = i != list.length && list[i] || null
		if (!asso || (!asso.type && !asso.factors)) return false
		asso.method = 'to'
		if (action.key) asso.key = action.key
		if (action.flag) asso.flag = action.key

		return true
	}

	if (action.method != 'lit') {
		list.push(null);
		this.repeat(rule)

		if (start == this.pos) {
			list.pop()
			return false
		}

		// num   = 1*DIGIT-Number
		list[i] = this.action(action, start,
			action.type && i + 1 == list.length);

		if (list[i].raw || !action.type) return true

		asso = list[i + 1] || null

		if (!asso) return false

		if (this.pos >= asso.end && asso.raw &&
			!asso.type && !asso.key && !asso.flag) {
			// num   = digit-Number
			// digit = 1*DIGIT--lit
			list[i].raw = asso.raw;
			list.pop()
			return true
		}

		return true
	}

	if (action.type || !this.repeat(rule)) return false;

	if (start == this.pos) return true;

	asso = i && list[i - 1] || null

	if (asso && asso.raw && asso.method == action.method &&
		asso.key == action.key &&
		asso.flag == action.flag) {

		asso.raw += this.src.slice(start, this.pos);
		asso.end = this.pos
		return true
	}

	asso = this.action(action, start, true);

	// prefix postfix
	if (action.flag == 'infix') {
		rule = this.rules.defs[n.ref];
		rule && rule.alts && rule.alts.some(function(a, i) {
			return asso.precedence = a.alts.some(function(n) {
				return n.raw == this
			}, this) && i + 1 || 0;
		}, asso.raw)
	}

	list.push(asso);
	return true
}

Actions.prototype.repeat = function repeat(n) {
	var min = !n.rep && 1 || n.rep.min || 0,
		max = !n.rep && 1 || n.rep.max || -1,
		c = 0,
		i = this.pos,
		list = this.list,
		len = list.length,
		method = n.alts && this.alts ||
		n.seqs && this.seqs ||
		n.raw && this.text ||
		n.first && this.range ||
		n.fields && this.binary ||
		n.ref && this.ref;

	while (c != max && this.pos < this.src.length && method.call(this, n))
		c++;

	if (c >= min) return true;

	while (len < list.length) list.pop();

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