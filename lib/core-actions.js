"use strict"
var AHEAD = 1,
	PREFIX = 2,
	INFIX = 4,
	EVENT = 1 << 9;

module.exports = Actions

// built-in plugin
var Plugins = Object.create(null);

Plugins.CORE_ACTIONS = function CORE_ACTIONS(n, self) {
	if (!n.method || n.method == 'FALSE') return false

	if (n.method == 'TRUE') {
		return true
	}

	if (n.method == 'mark') {
		self.pushEvent(self.markEvent(n))
		return true
	}

	// load
	if (self.stage.pos) return false

	if (typeof self.Plugins['LOAD_' + n.method] == 'function')
		return self.Plugins['LOAD_' + n.method](n, self)

	if (typeof Plugins['LOAD_' + n.method] == 'function')
		return Plugins['LOAD_' + n.method](n, self)

	if (typeof self.Plugins[n.method] == 'function')
		return self.Plugins[n.method](n, self)

	if (typeof Plugins[n.method] == 'function')
		return Plugins[n.method](n, self)

	return false
}

Plugins.EOF = function EOF(n, self) {
	if (self.EOF || self.stage.pos != self.src.length) return false
	return self.EOF = true
}

Plugins.LOAD_CRLF = function LOAD_CRLF(n, self) {
	self.plugins.CRLF = Plugins[!n.key && 'ANYCRLF' ||
		n.key == 'CR' && 'CR' ||
		n.key == 'LF' && 'LF' ||
		n.key == 'CRLF' && 'CRLF' || 'ANYCRLF'
	]

	self.stage.line = 1;
	self.stage.col = 1;

	return true
}

Plugins.CRLF_AFTER_CREATE = function CRLF_AFTER_CREATE(n, self) {
	n.loc = Object.create(null)
	n.loc.startLine = 0
	n.loc.startCol = 0
	n.loc.endLine = 0
	n.loc.endCol = 0
}

Plugins.CR = function CR(n, self) {
	if (self.src[self.stage.pos] != '\r') return false
	self.stage.pos++;
	self.stage.line++;
	self.stage.col = 1;
	return true
}

Plugins.LF = function LF(n, self) {
	if (self.src[self.stage.pos] != '\n') return false
	self.stage.pos++;
	self.stage.line++;
	self.stage.col = 1;
	return true
}

Plugins.CRLF = function CRLF(n, self) {
	if (self.src[self.stage.pos] != '\r' ||
		self.src[self.stage.pos + 1] != '\n') return false
	self.stage.pos += 2;
	self.stage.line++;
	self.stage.col = 1;
	return true
}

Plugins.ANYCRLF = function ANYCRLF(n, self) {
	return Plugins.CRLF(n, self) || Plugins.LF(n, self) ||
		Plugins.CR(n, self)
}

Plugins.LOAD_OUTDENT = function LOAD_OUTDENT(n, self) {
	var opt = Object.create(null);
	if (!self.plugins.CRLF) self.plugins.CRLF = Plugins.CRLF

	opt.CRLF = self.plugins.CRLF
	opt.char = n.key == 'SP' && ' ' || '\t';

	self.plugins.CRLF = Plugins.CRLF_OUTDENT.bind(opt)
	self.plugins.OUTDENT = Plugins.OUTDENT.bind(opt.char)
	self.plugins.ON_OUTDENT = Plugins.ON_OUTDENT.bind(opt)

	return true
}

Plugins.OUTDENT = function OUTDENT(n, self) {
	var event = self.markEvent(n, 'OUTDENT', n.extra &&
		(n.extra == 'SP' && 'SP' || 'TAB') ||
		this == ' ' && 'SP' || 'TAB');

	self.branch()
	self.pushEvent(event) // first
	return true
}

Plugins.CRLF_OUTDENT = function CRLF_OUTDENT(n, self) {
	var event;
	// override CRLF
	if (!this.CRLF(n, self)) return false
	event = self.factors[0];
	if (!event || event.key != 'OUTDENT') return false

}

Plugins.ON_OUTDENT = function ON_OUTDENT(n, self) {

}

// helper
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

function copy(via) {
	return Object.assign(Object.create(null), via)
}

function extend(dist, via) {
	if (!via) return dist

	if (Array.isArray(via)) via.forEach(
		function(fn) {
			if (typeof fn == 'function' && fn.name)
				this[fn.name] = fn
		}, dist)
	else
		dist = Object.assign(dist, obj)

	return dist
}

function Actions(inputSourceOrRules, plugins) {
	this.Plugins = extend(Object.create(null), plugins)
	this.plugins = Object.create(null)
	this.plugins.ACTIONS = Plugins.CORE_ACTIONS

	if (typeof inputSourceOrRules == 'string') {
		this.src = inputSourceOrRules
	} else if (inputSourceOrRules) {
		this.rules = inputSourceOrRules
		this.infixes = Object.create(null)
	}
}

Actions.prototype.markEvent = function markEvent(n, key, extra) {
	var event = this.create(n, this.stage.pos, false)
	event.type = 'ACTIONS'
	event.method = 'mark'
	if (key) event.key = key
	if (extra) event.extra = extra
	return event
}

Actions.prototype.pushEvent = function pushEvent(event) {
	this.factors.push(event)
	this.stage.flags |= EVENT;
	return event
}

Actions.prototype.init = function init() {
	this.EOF = false
	this.factors = []
	this.stack = []
	this.stage = Object.create(null)
	this.stage.pos = 0;
	this.stage.flags = 0;
}

Actions.prototype.parse = function parse(inputSource) {
	this.src = inputSource
	this.init()
	return this.play(this.rules.defs[this.rules.first])
}

Actions.prototype.retrans = function retrans(rules) {
	if (null == rules) return null
	this.rules = rules
	this.infixes = Object.create(null)
	this.init()
	return this.play(this.rules.defs[this.rules.first])
}

Actions.prototype.play = function play(n) {
	return n && this.repeat(n) && this.stage.pos == this.src.length &&
		this.build(this.factors) ||
		new Error('Actions failed');
}

Actions.prototype.branch = function branch() {
	this.stack.push(this.factors, copy(this.stage))
	this.factors = []
}

Actions.prototype.revert = function revert() {
	this.stage = this.stack.pop()
	this.factors = this.stack.pop()
}

Actions.prototype.commit = function commit() {
	this.stack.pop()
	this.factors = this.stack.pop()
}

Actions.prototype.build = function build(list) {
	var infix = [];
	if (this.stage.flags & EVENT) {
		this.stage.flags ^= EVENT
		if (!emitEvents(list, this)) return null
	}

	buildFactors(list, infix);
	infix.sort(leftToRight).forEach(buildInfix, list);

	return list.filter(non)
}

function emitEvents(list, ths) {
	return !list.some(function(n, i, list) {
		if (n && n.type == 'ACTIOINS' && n.method == 'mark') {
			if (!this.plugins['ON_' + n.key]) return true
			if (!this.plugins['ON_' + n.key](list, this, i)) return true
			if (list[i]) return true
			return false
		}
	}, ths)
}

function leftToRight(a, b) {
	return a[1] < b[1] && 1 ||
		a[1] > b[1] && -1 ||
		a[0] < b[0] && -1 ||
		a[0] > b[0] && 1 || 0
}

function buildFactors(list, infix) {
	var p, n, s, x, i = 0;

	while (i < list.length) {
		p = list[i++]

		if (!p || p.method != 'ahead') continue

		x = i - 1
		while (x && !list[--x]);
		n = list[x]
		list[x] = null

		s = n.key
		n.key = p.key
		p.key = s || ''

		s = n.extra
		n.extra = p.extra || ''
		p.extra = s || ''

		p.factors = [n]
		p.start = n.start

		x = p.end
		while (i < list.length) {
			n = list[i]
			if (n) {
				if (x <= n.start) break
				if (!p.factors) p.factors = [];
				p.factors.push(n)
				list[i] = null
			}
			i++
		}
	}

	i = 0
	while (i < list.length) {
		p = list[i++]

		if (!p || p.factors) continue

		if (p.method == 'infix') {
			x = innerPrecedence(list, i)
			if (x == -1) return false
			n = list[x]
			if (!n.precedence) return false

			x = innerOperand(list, x + 1)
			if (x == -1) return false

			p.end = list[x].end;
			infix.push([i - 1, n.precedence])
			i = x++;
			continue
		}

		if (p.method == 'prefix') {
			x = innerOperand(list, i)
			if (x == -1) return false

			p.end = list[x].end
			p.factors = []
			while (i <= x) {
				if (list[i]) {
					p.factors.push(list[i]);
					list[i] = null
				}
				i++
			}
			continue
		}

		x = p.end
		while (i < list.length) {
			n = list[i]
			if (n) {
				if (x <= n.start) break
				if (!p.factors) p.factors = [];
				p.factors.push(n)
				list[i] = null
			}
			i++
		}
	}

	return true
}

function buildInfix(a, j) {
	var o, s, j, i = a[0],
		n = this[i];

	while (i && !this[--i]);

	o = this[i] //left
	this[i] = null
	n.start = o.start

	s = o.key
	o.key = n.key
	if (s || n.key) n.key = s || ''

	s = o.extra
	if (n.extra || s) o.extra = n.extra || ''
	if (s || n.extra) n.extra = s

	n.factors = [o]

	i = a[0] + 1
	j = innerOperand(this, i)
	for (; i <= j; i++) {
		if (this[i]) {
			n.factors.push(this[i])
			this[i] = null
		}
	}
	n.end = n.factors[n.factors.length - 1].end
}

Actions.prototype.precedence = function precedence(rule, raw) {
	// results precedence for infix operator, and greedy match
	var i, a = this.infixes[rule.name];
	if (!a) {
		a = this.infixes[rule.name] = []
		rule.alts.forEach(function(n, i) {
			i++
			if (n.alts) n.alts.forEach(function(n) {
				a.push([n.raw, i])
			})
			else if (n.raw)
				a.push([n.raw, i])
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
	a.end = this.stage.pos

	if (n) {
		if (raw) a.raw = this.src.slice(start, a.end);
		if (n.type) a.type = n.type;
		if (n.method) a.method = n.method;
		if (n.key) a.key = n.key;
		if (n.extra) a.extra = n.extra;
	}

	return a
}

function innerOperand(list, i) {
	var n;
	for (; i < list.length; i++) {
		n = list[i]
		if (n && n.type && !n.precedence && n.method != 'mark')
			return i
	}
	return -1
}

function innerPrecedence(list, i) {
	var n;
	for (; i < list.length; i++) {
		n = list[i]
		if (!n) continue
		if (n.precedence) return i
		if (n.method != 'mark') break
	}
	return -1
}

function aheadOperand(list, i) {
	var n;
	while (i--) {
		n = list[i]
		if (n.method == 'alone' || !n.precedence &&
			n.type && n.method != 'mark')
			return i
	}
	return -1
}

function sortRaw(a, b) {
	if (!a.raw) return 0
	if (!b.raw) return -1
	return a.start < b.start && -1 || 1
}

Actions.prototype.action = function action(n) {
	var asso, list, x,
		i = this.factors.length,
		start = this.stage.pos,
		rule = this.rules.defs[n.ref];

	if (n.method == 'lit') {
		if (!this.repeat(rule)) return false;

		if (start == this.stage.pos) return true;

		asso = i && this.factors[i - 1] || null

		if (asso && asso.raw && asso.type == n.type &&
			asso.method == n.method &&
			asso.key == n.key) {
			asso.end = this.stage.pos
			asso.raw += this.src.slice(start, asso.end);
			return true
		}

		this.factors.push(this.create(n, start, true));
		return true
	}

	// alone
	if (n.method == 'alone') {
		this.branch();
		if (!this.repeat(rule)) {
			this.revert()
			return false
		}

		if (start == this.stage.pos) {
			this.revert()
			return true
		}

		asso = this.create(n, start, false);
		asso.factors = this.build(this.factors)
		this.commit()

		if (asso.factors.length == 1) {
			asso = asso.factors[0]
			asso.method = 'alone'
			if (n.key) asso.key = n.key
			if (n.extra) asso.extra = n.extra
		}

		this.factors.push(asso)
		return true
	}

	if (n.method == 'inner') {
		if (!n.key || !this.repeat(rule) || i == this.factors.length)
			return false
		if (start == this.stage.pos) return true

		list = this.factors
		x = innerOperand(list, i)
		if (x == -1) {
			while (i != list.length) list.pop();
			return false
		}

		asso = list[x]
		asso.key = n.key
		if (n.extra) asso.extra = n.extra

		return true
	}

	if (n.method == 'precedence') {
		if (!this.repeat(rule) ||
			start == this.stage.pos ||
			i != this.factors.length
		) return false
		asso = this.create(n, start, true);
		asso.precedence = this.precedence(rule, asso.raw)
		if (!asso.precedence) return false
		this.factors.push(asso)
		return true
	}

	list = this.factors
	list.push(null)

	if (!this.repeat(rule)) {
		list.pop()
		return false
	}

	if (i + 1 == list.length) {
		// chain        = Ident- CallExpr-ahead-callee-
		// CallExpr     = "(" [arguments] ")"
		list[i] = this.create(n, start, false)
		return true
	}

	asso = list[i + 1]
	if (n.type && asso.raw &&
		!asso.type && !asso.key && !asso.extra) {
		// num   = digit-Number
		// digit = 1*DIGIT--lit
		asso.type = n.type
		if (n.method) asso.method = n.method
		if (n.key) asso.key = n.key
		if (n.extra) asso.extra = n.extra
		while (i < list.length) list[i] = list[++i];
		list.pop()
		return true
	}

	list[i] = this.create(n, start, false)
	return true
}

Actions.prototype.repeat = function repeat(n) {
	var c = 0,
		stage = copy(this.stage),
		max = !n.rep && 1 || n.rep.max || -1,
		method = n.ref && (this.plugins[n.ref] && Plugin ||
			!n.tail && Ref || this.action) ||
		n.alts && Choice ||
		n.seqs && Serial ||
		n.raw && Text ||
		n.first && Range ||
		n.fields && Binary || null;

	if (!method) return false
	while (c != max && this.stage.pos < this.src.length && method.call(this, n))
		c++;

	if (c >= (!n.rep && 1 || n.rep.min || 0)) return true;

	this.stage = stage
	return false
}

function Plugin(n) {
	return this.plugins[n.ref] &&
		this.plugins[n.ref](n, this)
}

function Ref(n) {
	return this.rules.defs[n.ref] &&
		this.repeat(this.rules.defs[n.ref]) && true || false
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
	if (!n.raw) return false // for precedence = ("or") / ("and") / ("")
	if (this.src.substr(this.stage.pos, n.raw.length) != n.raw) return false
	this.stage.pos += n.raw.length;
	return true
}

function Range(n) {
	var code = this.src.charCodeAt(this.stage.pos).toString(n.radix)
	if (code < n.first || code > n.last) return false
	this.stage.pos++;
	return true
}

function Binary(n) {
	return n.fields.every(function(raw, i) {
		return this.src.charCodeAt(this.stage.pos + i).toString(n.radix) == raw
	}, this) && (this.stage.pos += n.fields.length) && true || false
}