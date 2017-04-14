"use strict"
var AHEAD = 1,
	PREFIX = 2,
	INFIX = 4,
	EVENT = 1 << 9;

module.exports = Actions

// built-in plugin
var Plugins = Object.create(null);

Plugins.CORE_ACTIONS = function CORE_ACTIONS(n, self) {
	if (!n.method) return false

	if (self.loaded || self.plugins[n.method]) return true
	if (typeof self.plugins['LOAD_' + n.method] == 'function')
		return self.plugins['LOAD_' + n.method](n, self)

	if (typeof Plugins['LOAD_' + n.method] == 'function')
		return Plugins['LOAD_' + n.method](n, self)

	if (typeof self.plugins[n.method] == 'function')
		return self.plugins[n.method](n, self)

	return false
}

Plugins.EVENT_TRUE = function EVENT_TRUE(self, list, i, n) {
	return true
}

Plugins.LOAD_EOF = function LOAD_EOF(n, self) {
	self.plugins.EOF = Plugins.EOF
	return true
}

Plugins.EOF = function EOF(n, self) {
	return self.pos == self.src.length
}

Plugins.LOAD_CRLF = function LOAD_CRLF(n, self) {
	setCRLF(self)
	self.plugins.CRLF = Plugins.CRLF
	return true
}

function setCRLF(self) {
	var i = self.src.indexOf('\r') + 1;
	self.crlf = !i && '\n' ||
		self.src[i] == '\n' && '\r\n' || '\r';
}

Plugins.CRLF = function CRLF(n, self) {
	if (self.crlf != self.src.slice(self.pos, self.pos + self.crlf.length))
		return false
	self.pos += self.crlf.length;
	if (!self.eols.length || self.eols[self.eols.length - 1] < self.pos)
		self.eols.push(self.pos)
	return true
}

function setLocation(list, eols) {
	var i = 0;
	list.forEach(function(n) {
		n.loc = Object.create(null)
		i = locStart(n, eols, i)
		i = locEnd(n, eols, i)
	})
}

function locStart(n, eols, i) {
	while (i < eols.length && eols[i] <= n.start) i++;
	while (i < eols.length && i >= 0 && eols[i] > n.start) i--;
	if (i == -1 || !eols.length) {
		n.loc.startLine = 1
		n.loc.startCol = n.start + 1
		return 0
	}

	n.loc.startLine = i + 1
	if (i == eols.length) i--;
	else n.loc.startLine++;
	n.loc.startCol = n.start + 1 - eols[i]
	return i
}

function locEnd(n, eols, i) {
	while (i < eols.length && eols[i] <= n.end) i++;
	while (i < eols.length && i >= 0 && eols[i] > n.end) i--;
	if (i == -1 || !eols.length) {
		n.loc.endLine = 1
		n.loc.endCol = n.end + 1
		return 0
	}

	n.loc.endLine = i + 1
	if (i == eols.length) i--;
	else n.loc.endLine++;

	n.loc.endCol = n.end + 1 - eols[i]
	return i
}

Plugins.LOAD_OUTDENT = function LOAD_OUTDENT(n, self) {

	if (!self.plugins.CRLF && !Plugins.LOAD_CRLF(n, self))
		return false

	self.indent = n.key == 'SP' && 0x20 || 0x09;
	self.plugins.OUTDENT = Plugins.OUTDENT
	self.plugins.ON_OUTDENT = Plugins.EVENT_TRUE
	self.plugins.CRLF_ORIGIN = self.plugins.CRLF
	self.plugins.CRLF = Plugins.CRLF_OUTDENT
	return true
}

Plugins.OUTDENT = function OUTDENT(n, self) {
	if (!self.stack.length || self.factors.length) {
		self.err = 'OUTDENT: must be first in method alone'
		return false
	}

	if (n.method && !self.rules[n.method]) {
		self.err = 'OUTDENT: the rule is not defined: ' + n.method
		return false
	}

	if (n.key && !self.rules[n.key]) {
		self.err = 'OUTDENT: the rule is not defined: ' + n.key
		return false
	}

	return self.before('OUTDENT', [n.method, n.key, n.extra && 'n' || ''] || null)
}

Plugins.CRLF_OUTDENT = function CRLF_OUTDENT(n, self) {
	var a, pos, col = 0;

	if (!self.plugins.CRLF_ORIGIN(n, self))
		return false

	if (!self.eols.length ||
		!self.stack.length || !self.factors.length ||
		!self.isEvent(self.factors[0], 'OUTDENT')) return true

	a = self.factors[0]

	if (!a.loc) {
		a.loc = Object.create(null)
		locStart(a, self.eols, 0)
	}

	while (self.indent == self.src.charCodeAt(self.pos + col))
		col++;
	col++
	if (col < a.loc.startCol)
		self.break = true
	else if (col == a.loc.startCol) {
		// allow
		if (a.extra[0]) {
			pos = self.pos
			self.pos += col - 1
			self.break = !self.repeat(self.rules[a.extra[0]]) &&
				!a.extra[2] && true || false
			self.pos = pos
		}
	} else if (a.extra[1]) {
		pos = self.pos
		self.pos += col - 1
		if (self.repeat(self.rules[a.extra[1]])) {
			self.pos = pos
			return false
		}
		self.pos = pos
	}

	return true
}

// debug
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
	this.pos = 0;
	this.indent = 0;
	this.loaded = false
	this.infixes = Object.create(null)
	this.plugins = Object.create(null)
	this.addPlugins(plugins)
	this.plugins.ACTIONS = Plugins.CORE_ACTIONS

	if (typeof inputSourceOrRules == 'string')
		this.src = inputSourceOrRules
	else if (inputSourceOrRules)
		this.addRules(inputSourceOrRules)
}

Actions.prototype.addPlugins = function addPlugins(plugins) {
	this.plugins = extend(this.plugins, plugins)
}

Actions.prototype.addRules = function addRules(rules) {
	if (!this.first) this.first = rules.first
	this.rules = Object.assign(
		this.rules || Object.create(null), rules.defs)
}

Actions.prototype.before = function before(key, extra) {
	var event = Object.create(null)
	event.start = this.pos
	event.end = this.pos
	event.type = '-e'
	event.method = 'mark'
	event.key = 'ON_' + (key || '')
	if (Array.isArray(extra)) event.extra = extra
	if (!this.plugins[event.key]) return false;

	this.events.push(this.factors.length);
	this.factors.push(event)
	return true
}

Actions.prototype.isEvent = function isEvent(n, key) {
	return n && n.type == '-e' && n.method == 'mark' &&
		n.key == 'ON_' + key
}

Actions.prototype.init = function init() {
	this.err = '';
	this.crlf = '';
	this.break = false;
	this.eols = [];
	this.factors = [];
	this.events = [];
	this.stack = [];
	if (this.plugins.CRLF) setCRLF(this)
}

Actions.prototype.parse = function parse(inputSource) {
	this.pos = 0;
	this.src = inputSource
	this.init()
	return this.play(this.rules[this.first])
}

Actions.prototype.retrans = function retrans(rules) {
	if (rules) {
		this.addRules(rules)
		return null
	}

	if (!this.src) return this

	this.init()
	return this.play(this.rules[this.first])
}

Actions.prototype.play = function play(n) {
	var ok = n && this.repeat(n) && this.pos == this.src.length;
	this.loaded = true
	return ok && this.build(this.factors) || new Error(this.err || 'Actions build failed');
}

Actions.prototype.branch = function branch() {
	this.stack.push(this.events, this.pos, this.factors)
	this.factors = []
	this.events = []
}

Actions.prototype.revert = function revert() {
	this.factors = this.stack.pop()
	this.pos = this.stack.pop()
	this.events = this.stack.pop()
}

Actions.prototype.commit = function commit() {
	this.factors = this.stack.pop()
	this.stack.pop()
	this.events = this.stack.pop()
}

Actions.prototype.upperFactors = function upperFactors() {
	return this.stack.length && this.stack[this.stack.length - 1] || null
}

Actions.prototype.build = function build(list) {
	var infix = [];
	if (this.crlf) setLocation(list, this.eols)

	if (this.events.length) {
		if (!emitEvents(this, list, this.events)) return false
		this.events = []
	}

	if (!buildFactors(list, infix)) return false;

	infix.sort(leftToRight).forEach(buildInfix, list);

	return list.filter(non)
}

function emitEvents(ths, list, events) {
	return events.every(function(i) {
		var n = list[i];
		list[i] = null
		if (this.plugins[n.key](this, list, i, n))
			return true
		if (!this.err) this.err = n.key + ' fail'
		return false
	}, ths)
}

function leftToRight(a, b) {
	return a[1] < b[1] && 1 ||
		a[1] > b[1] && -1 ||
		a[0] < b[0] && -1 ||
		a[0] > b[0] && 1 || 0
}

function copyStart(dist, src) {
	dist.loc.startLine = src.loc.startLine
	dist.loc.startCol = src.loc.startCol
}

function copyEnd(dist, src) {
	dist.loc.endLine = src.loc.endLine
	dist.loc.endCol = src.loc.endCol
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

		if (n.extra || p.extra) {
			s = n.extra
			n.extra = p.extra || null
			p.extra = s || null
		}

		p.factors = [n]

		p.start = n.start
		if (p.loc) copyStart(p, n)

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
			if (p.loc) copyEnd(p, list[x])

			infix.push([i - 1, n.precedence])
			i = x++;
			continue
		}

		if (p.method == 'prefix') {
			x = innerOperand(list, i)
			if (x == -1) return false

			p.end = list[x].end
			if (p.loc) copyEnd(p, list[x])

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
	if (n.loc) copyStart(n, o)

	s = o.key
	o.key = n.key
	if (s || n.key) n.key = s || ''

	if (o.extra || n.extra) {
		s = o.extra
		o.extra = n.extra || null
		n.extra = s || null
	}

	n.factors = [o]

	i = a[0] + 1
	j = innerOperand(this, i)
	for (; i <= j; i++) {
		if (this[i]) {
			n.factors.push(this[i])
			this[i] = null
		}
	}

	o = n.factors[n.factors.length - 1]
	n.end = o.end
	if (n.loc) copyEnd(n, o)
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
	a.end = this.pos

	if (n) {
		if (raw) a.raw = this.src.slice(start, a.end);
		if (n.type) a.type = n.type;
		if (n.method) a.method = n.method;
		if (n.key) a.key = n.key;
		if (n.extra) a.extra = n.extra.split('-');
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
		start = this.pos,
		rule = this.rules[n.ref];

	if (n.method == 'lit') {
		if (n.extra || !this.repeat(rule)) return false;

		if (start == this.pos) return true;
		if (n.type) {
			this.factors.push(this.create(n, start, true));
			return true
		}

		asso = i && this.factors[i - 1] || null

		if (asso && asso.raw && asso.method == n.method &&
			asso.key == n.key) {
			asso.end = this.pos
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

		if (start == this.pos) {
			this.revert()
			return true
		}

		asso = this.create(n, start, false);
		asso.factors = this.build(this.factors)
		this.commit()

		if (asso.factors.length == 1) {
			asso = asso.factors[0]
			if (n.key) asso.key = n.key
			if (n.extra) asso.extra = n.extra.split('-')
		}

		this.factors.push(asso)
		return true
	}

	if (n.method == 'inner') {
		if (!n.key || !this.repeat(rule) || i == this.factors.length)
			return false
		if (start == this.pos) return true

		list = this.factors
		x = innerOperand(list, i)
		if (x == -1) {
			while (i != list.length) list.pop();
			return false
		}

		asso = list[x]
		asso.key = n.key
		if (n.extra) asso.extra = n.extra.split('-')

		return true
	}

	if (n.method == 'precedence') {
		if (!this.repeat(rule) ||
			start == this.pos ||
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
		if (n.extra) asso.extra = n.extra.slice()
		while (i < list.length) list[i] = list[++i];
		list.pop()
		return true
	}

	list[i] = this.create(n, start, false)
	return true
}

Actions.prototype.repeat = function repeat(n) {
	var c = 0,
		pos = this.pos,
		max = !n.rep && 1 || n.rep.max || -1,
		method = n.ref && (this.plugins[n.ref] && Plugin ||
			!n.tail && Ref || this.action) ||
		n.alts && Choice ||
		n.seqs && Serial ||
		n.raw && Text ||
		n.first && Range ||
		n.fields && Binary || null;

	if (!method || this.err) return false

	while (!this.err && c != max && method.call(this, n)) {
		c++;
		if (this.break || this.pos >= this.src.length)
			break
	}

	if (!this.err && c >= (!n.rep && 1 || n.rep.min || 0))
		return true;

	this.pos = pos
	return false
}

function Plugin(n) {
	return this.plugins[n.ref] &&
		this.plugins[n.ref](n, this) && true || false
}

function Ref(n) {
	return this.rules[n.ref] &&
		this.repeat(this.rules[n.ref]) && true || false
}

function Choice(n) {
	return n.alts.some(function(n) {
		return this.repeat(n)
	}, this);
}

function Serial(n) {
	if (n.seqs.every(function(n) {
			return this.repeat(n) && !this.break
		}, this)) return true;

	if (!this.break) return false
	this.break = false
	return true
}

function Text(n) {
	if (!n.raw) return false // for precedence = ("or") / ("and") / ("")
	if (this.src.substr(this.pos, n.raw.length) != n.raw) return false
	this.pos += n.raw.length;
	return true
}

function Range(n) {
	var code = this.src.charCodeAt(this.pos)
	if (code < n.first || code > n.last) return false
	this.pos++;
	return true
}

function Binary(n) {
	return n.fields.every(function(raw, i) {
		return this.src.charCodeAt(this.pos + i) == raw
	}, this) && (this.pos += n.fields.length) && true || false
}