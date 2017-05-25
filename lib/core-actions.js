"use strict"
var Plugins = Object.create(null);

// debug
var ASON = require('./ason');

function echo(list, a, ason) {
	console.log('...... \n', a && JSON.stringify(a) || '');
	if (ason) return console.log(ASON.serialize(list));
	list && list.forEach(function(n, i) {
		console.log('\n', i, '\t', JSON.stringify(n))
	})
}

module.exports = Actions

Plugins.ACTIONS = function ACTIONS(n, self) {
	if (!n.method) {
		self.err = 'unsupported ' + n.ref + n.tail
		return false
	}

	if (self.loaded || self.plugins[n.method]) return true

	if (typeof self.Plugins['LOAD_' + n.method] == 'function')
		return self.Plugins['LOAD_' + n.method](n, self)

	if (typeof self.Plugins[n.method] == 'function') {
		self.plugins[n.method] = self.Plugins[n.method]
		return true
	}

	if (typeof Plugins['LOAD_' + n.method] == 'function')
		return Plugins['LOAD_' + n.method](n, self)

	if (typeof Plugins[n.method] == 'function') {
		self.plugins[n.method] = Plugins[n.method]
		return true
	}

	self.err = 'unsupported ' + n.ref + n.tail
	return false
}

Plugins.EVENT_TRUE = function EVENT_TRUE(self, list, n) {
	return true
}

Plugins.SWAP = function SWAP(n, self) {
	var s, i = self.factors.length,
		a = i >= 2 && self.factors[i - 2] || null,
		b = a && self.factors[i - 1] || null;

	if (!a || !b) {
		self.err = 'missing two Action before ' + n.ref + n.tail
		return false
	}
	if (a.key || b.key) {
		s = a.key
		a.key = b.key || ''
		b.key = s || ''
	}
	if (a.flag || b.flag) {
		s = a.flag
		a.flag = b.flag || ''
		b.flag = s || ''
	}
	return true
}

Plugins.RAW = function RAW(n, self) {
	var a = self.factors.length &&
		self.factors[self.factors.length - 1] || null;
	if (!a || a.raw == null) {
		self.err = 'missing an Action before ' + n.ref + n.tail
		return false
	}

	if (n.method == 'IS')
		return a.raw == n.tail.substring(4)
	if (n.method == 'UN')
		return a.raw != n.tail.substring(4)

	self.err = 'unsupported RAW' + n.tail
	return false
}

Plugins.NON = function NON(n, self) {
	var rules = self.rules,
		a = self.factors.length &&
		self.factors[self.factors.length - 1] || null;

	self.err = !n.tail && 'unsupported ' + n.ref + n.tail
	if (self.err) return false

	if (!a || a.raw == null) return true

	self.err =
		n.method && (!rules[n.method] && 'undefined rule ' + n.method ||
			Deny(rules[n.method], a.raw)) ||
		n.key && (!rules[n.key] && 'undefined rule ' + n.key ||
			Deny(rules[n.key], a.raw)) ||
		n.type && (!rules[n.type] && 'undefined rule ' + n.type ||
			Deny(rules[n.type], a.raw)) || ''

	if (!self.err) return true

	self.pos = a.start
	self.err = self.err[0] != 'd' &&
		self.err + ' on ' + n.ref + n.tail ||
		'';
	return false
}

Plugins.DENY = function DENY(n, self) {
	var rules = self.rules,
		a = self.factors.length &&
		self.factors[self.factors.length - 1] || null;

	self.err = !n.tail && 'unsupported ' + n.ref + n.tail ||
		(!a || a.raw == null) &&
		'missing an Action.raw before ' + n.ref + n.tail || ''

	if (self.err) return false

	self.err =
		n.method && (!rules[n.method] && 'undefined rule ' + n.method ||
			Deny(rules[n.method], a.raw)) ||
		n.key && (!rules[n.key] && 'undefined rule ' + n.key ||
			Deny(rules[n.key], a.raw)) ||
		n.type && (!rules[n.type] && 'undefined rule ' + n.type ||
			Deny(rules[n.type], a.raw)) || ''

	if (!self.err) return true

	self.err += ' on ' + n.ref + n.tail;
	self.pos = a.start
	self.failNode.offset = self.pos
	return false
}

function Deny(rule, raw) {
	var i, alts = rule.alts || [rule];

	for (i = 0; i < alts.length; i++) {
		if (alts[i].raw == null) return 'unsupported non-string sequence';
		if (alts[i].raw == raw) return 'deny ' + raw
	}
	return ''
}

Plugins.FLAG = function FLAG(n, self) {
	var i, a = self.factors.length &&
		self.factors[self.factors.length - 1] || null;

	if (!n.tail || n.tail.length == 1) {
		self.err = 'missing flags in ' + n.ref + (n.tail || '')
		return false
	}

	if (!a || !a.type) {
		self.err = 'missing an Action.type before ' + n.ref + (n.tail || '')
		return false
	}

	if (a.flag) {
		i = a.flag.indexOf(n.tail) + n.tail.length
		if (i >= n.tail.length && (i == a.flag.length || a.flag[i] == '-')) {
			self.err = 'the flags already exists on ' + n.ref + n.tail
			return false
		}
	}

	a.flag = (a.flag || '') + n.tail
	return true
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

function IS_CRLF(n, self) {
	if (self.crlf != self.src.substring(self.pos, self.pos + self.crlf.length))
		return false
	self.pos += self.crlf.length;
	if (!self.eols.length || self.eols[self.eols.length - 1] < self.pos)
		self.eols.push(self.pos)
	return true
}

Plugins.CRLF = function CRLF(n, self) {
	if (!IS_CRLF(n, self)) return false
	if (self.indent && self.isEvent(self.events[0], 'OUTDENT'))
		return CRLF_OUTDENT(n, self, self.events[0])
	return true
}

function setLocation(self, x) {
	var n, i = 0,
		eols = self.eols,
		list = self.factors;

	while (x < list.length) {
		n = list[x++]
		n.loc = Object.create(null)
		i = locStart(n, eols, i)
		i = locEnd(n, eols, i)
	}
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

	if (n.key == 'SP') {
		if (n.type) {
			self.indent = parseInt(n.type)
			if (!self.indent || self.indent > 8) {
				self.err = 'unsupported more than 8 spaces indentation'
				return false
			}
		} else
			self.indent = 0x20
	} else
		self.indent = 0x09


	self.plugins.OUTDENT = Plugins.OUTDENT
	self.plugins.ON_OUTDENT = Plugins.EVENT_TRUE
	return true
}

Plugins.OUTDENT = function OUTDENT(n, self) {
	var a, i;
	if (self.factors.length) {
		self.err = 'must be first of the factors on ' + n.ref + n.tail
		return false
	}

	a = self.before('OUTDENT', n.tail)

	a.loc = Object.create(null)
	i = self.eols.length - 1;
	while (i != -1 && self.eols[i] > a.start) i--;

	i = i != -1 && self.eols[i] || 0

	a.loc.startCol = 0 // indentation
	if (self.indent == 0x09)
		while ('\t' == self.src[i + a.loc.startCol])
			a.loc.startCol++;
	else
		while (' ' == self.src[i + a.loc.startCol])
			a.loc.startCol++;

	// auto aligned
	if (!a.method && a.loc.startCol && i == self.pos) {
		self.pos += a.loc.startCol
		a.method = '-'
	}

	return true
}

function CRLF_OUTDENT(n, self, event) {
	var col = 0,
		pos = self.pos;

	while (IS_CRLF(n, self));

	if (self.indent == 0x09) {
		while (0x09 == self.src.charCodeAt(self.pos + col))
			col++;
	} else {
		while (0x20 == self.src.charCodeAt(self.pos + col))
			col++;
		if (self.indent == 0x20) {
			if (col > 8) {
				self.err = 'unsupported more than 8 spaces indentation'
				return false
			}
			self.indent = col || 0x20
		} else if (col % self.indent) {
			self.err = 'unsupported non-strict indentation'
			return false
		}
	}

	if (col < event.loc.startCol ||
		!event.method && col == event.loc.startCol) {
		self.pos = pos - self.crlf.length
		return false
	}
	self.pos += col
	return true
}

Plugins.MUST = function MUST(n, self) {
	self.frozen = self.pos
	return true
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
	this.indent = '';
	this.loaded = false
	this.infixes = Object.create(null)
	this.plugins = Object.create(null)
	this.plugins.ACTIONS = Plugins.ACTIONS

	this.addPlugins(plugins)

	if (typeof inputSourceOrRules == 'string')
		this.src = inputSourceOrRules
	else if (inputSourceOrRules)
		this.addRules(inputSourceOrRules)
}

Actions.prototype.addPlugins = function addPlugins(plugins) {
	this.Plugins = extend(this.Plugins || Object.create(null), plugins)
}

Actions.prototype.addRules = function addRules(rules) {
	if (!this.first) this.first = rules.first
	this.rules = Object.assign(
		this.rules || Object.create(null), rules.defs)
}

Actions.prototype.before = function before(type, method, key) {
	var a;

	if (!this.plugins['ON_' + type]) return false;
	a = Object.create(null)
	a.start = this.pos
	a.end = this.pos
	a.type = '-' + type
	if (method) a.method = method
	if (key) a.key = key
	a.index = this.factors.length
	this.events.push(a)
	return a
}

Actions.prototype.isEvent = function isEvent(a, type) {
	return a && a.type == '-' + type
}

Actions.prototype.reset = function reset() {
	this.failNode = {
		offset: -1,
		line: 0,
		col: 0,
		rulename: '',
		src: '',
	};

	this.pos = 0;
	this.frozen = 0;
	this.end = this.src.length;
	this.err = '';
	this.crlf = '';
	this.eols = [];
	this.factors = [];
	this.events = [];
	this.stack = [];
	this.code = null;
	if (this.plugins.CRLF) setCRLF(this)
}

Actions.prototype.parse = function parse(inputSource, rulename) {
	var results, loaded = this.loaded,
		rule = this.rules[rulename || this.first];

	this.src = inputSource
	this.reset()

	if (!rule) return new Error(
		'undefined rule ' + (rulename || this.first))

	results = this.play(rule)
	this.loaded = loaded || rule.name == this.first
	return results
}

Actions.prototype.retrans = function retrans(rules) {
	var ok;
	if (rules) {
		this.addRules(rules)
		return null
	}

	if (!this.src) return this

	this.reset()
	ok = this.play(this.rules[this.first])
	this.loaded = true
	return ok
}

Actions.prototype.play = function play(n) {
	var ok = this.repeat(n);

	if (!this.err && (!ok || this.pos != this.end))
		return new Error('Actions has an unfinished match at: ' +
			failed.call(this))

	return !this.err && this.build(0) ||
		new Error('Actions error, ' + this.err + ': ' +
			failed.call(this))
}

Actions.prototype.fail = function fail(n) {
	if (n.name && this.failNode.offset < this.pos) {
		this.failNode.offset = this.pos
		this.failNode.rulename = n.name
	}
	return false
}

function locFail(n, eols) {
	var i = eols.length && eols.length - 1 || 0;
	while (i < eols.length && i >= 0 && eols[i] > n.offset) i--;
	if (i == -1 || !eols.length) {
		n.line = 1
		n.col = n.offset + 1
		return 0
	}

	n.line = i + 1
	if (i == eols.length) i--;
	else n.line++;
	n.col = n.offset + 1 - eols[i]
	return i
}

function failed() {
	var len = this.src.indexOf(this.crlf, this.failNode.offset);
	len = len == -1 && 20 || len - this.failNode.offset;
	len = len <= 20 && len || 20;

	locFail(this.failNode, this.eols)
	this.failNode.src = this.src.substring(
		this.failNode.offset,
		this.failNode.offset + len
	) + (this.failNode.offset + len < this.end && '...' || '')

	return JSON.stringify(this.failNode);
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

Actions.prototype.build = function build(from) {
	var list;
	if (this.crlf) setLocation(this, from)

	if (this.events.length && !emitEvents(this, from))
		return null

	if (this.err = buildFactors(this, from)) return null;

	if (!from) {
		list = this.factors.filter(non)
		this.factors = []
	} else {
		list = this.factors.slice(from).filter(non)
		this.factors = this.factors.slice(0, from)
	}

	return list
}

function emitEvents(self, from) {
	self.events = self.events.filter(function(n) {
		if (n.index < from) return true
		if (!this.err && !this.plugins['ON_' + n.type.substring(1)](this, this.factors, n))
			this.err = this.err || 'the ' + n.type.substring(1) + ' plugin failed'
		return false
	}, self)
	return !self.err
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

function buildFactors(self, i) {
	var p, n, s, x, infix = [],
		list = self.factors;

	while (i < list.length) {
		p = list[i++]

		if (!p || p.factors) continue;

		if (p.method == 'infix') {
			x = nextOperand(list, i)
			if (x == -1) return 'missing operands on infix'

			p.end = list[x].end;
			if (p.loc) copyEnd(p, list[x])

			infix.push([i - 1, p.precedence])
			i = x++;
			continue
		}

		if (p.method == 'prefix') {
			x = nextOperand(list, i)
			if (x == -1) return 'missing operands on prefix'
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

	infix.sort(leftToRight).forEach(buildInfix, list);
	return ''
}

function buildInfix(a) {
	var o, s, j, i = a[0],
		n = this[i];

	while (i && !this[--i]);

	o = this[i] //left
	this[i] = null

	n.start = o.start
	if (n.loc) copyStart(n, o)

	if (o.key || n.key) {
		s = o.key
		o.key = n.key
		n.key = s || ''
	}

	if (o.flag || n.flag) {
		s = o.flag
		o.flag = n.flag
		n.flag = s || ''
	}

	n.factors = [o]

	i = a[0] + 1
	j = nextOperand(this, i)
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
		if (raw) a.raw = this.src.substring(start, a.end);
		if (n.type) a.type = n.type;
		if (n.method) a.method = n.method;
		if (n.key) a.key = n.key;
	}

	return a
}

function nextOperand(list, i) {
	var a;
	for (; i < list.length; i++) {
		a = list[i]
		if (a && a.type && a.method != 'note') return i
	}
	return -1
}

function nextPrecedence(list, i) {
	for (; i < list.length; i++) {
		if (list[i] && list[i].precedence)
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
	var asso, x,
		list = this.factors,
		i = list.length,
		start = this.pos,
		rule = this.rules[n.ref];

	if (start >= this.end && n.method != 'amend') return false

	if (!rule) {
		this.err = 'undefined rule ' + n.ref + n.tail;
		return false
	}

	// ref-to-key / ref-reset-[key]
	if (!n.method && !n.type || n.method == 'reset') {
		if (!n.method && !n.key || n.method && n.type) {
			this.err = 'unsupported ' + n.ref + n.tail
			return false
		}

		if (!this.repeat(rule) || i == list.length)
			return false;

		asso = list[i]
		if (n.key) asso.key = n.key
		if (n.method) asso.start = start;

		return true
	}

	if (n.method == 'leaf' || n.method == 'note') {
		if (!this.repeat(rule)) return false
		if (i != list.length) {
			this.err = 'unexpected an Action in ' + n.ref + n.tail
			return false
		}

		asso = this.create(n, start, true)
		list.push(asso)
		return true
	}

	if (n.method == 'operator') {
		if (!n.key) {
			this.err = 'expected key on ' + n.ref + n.tail
			return false
		}

		if (!this.repeat(rule)) return false

		if (i != list.length || start == this.pos) {
			this.err = 'unsupported ' + n.ref + n.tail
			return false
		}

		asso = this.create(n, start, true)
		asso.precedence = asso.raw && this.precedence(rule, asso.raw) || 0

		if (!asso.precedence) {
			this.err = 'missing precedence in ' + n.ref + n.tail
			return false
		}

		list.push(asso)

		return true
	}

	if (n.method == 'lit') {
		if (n.key && n.type) {
			this.err = 'unsupported ' + n.ref + n.tail
			return false
		}

		if (!this.repeat(rule)) return false;

		if (n.type) {
			list.push(this.create(n, start, true));
			return true
		}
		asso = i && list[i - 1] || null

		if (asso && !asso.type && asso.method == 'lit' && asso.key == n.key) {
			asso.end = this.pos
			asso.raw += this.src.substring(start, asso.end);
			return true
		}

		list.push(this.create(n, start, true));
		return true
	}

	// make action.factors
	if (n.method == 'alone' || n.method == 'factors' || n.method == 'list') {
		this.branch();
		if (!this.repeat(rule)) {
			this.revert()
			return false
		}

		list = this.build(0)

		if (!list) {
			this.revert()
			return false
		}

		this.commit()

		if (n.method == 'alone') {
			if (list.length != 1) {
				this.err = 'expected the only Action in ' + n.ref + n.tail
				return false
			}
			asso = list[0]
			if (n.type) asso.type = n.type
			if (n.key) asso.key = n.key
		} else {
			asso = this.create(n, start, false);
			asso.factors = list
		}

		this.factors.push(asso)
		return true
	}

	if (n.method == 'test') {
		this.branch();
		if (!this.repeat(rule)) {
			this.revert()
			return false
		}
		start = this.pos
		this.revert()
		if (n.key) this.pos = start
		return true
	}

	if (n.method == 'amend') {
		if (!n.type && !n.key) {
			this.err = 'unsupported ' + n.ref + n.tail
			return false
		}
		asso = i && list[i - 1] || null
		if (!asso) {
			this.err = 'missing an Action on ' + n.ref + n.tail
			return false
		}
		// only modify the type
		if (!n.key) {
			if (!this.repeat(rule)) return false

			if (i != list.length) {
				this.err = 'unexpected an Action in ' + n.ref + n.tail
				return false
			}

			asso.type = n.type;
			this.frozen = this.pos
			return true
		}
	}

	list.push(null)

	if (!this.repeat(rule)) {
		this.factors.pop()
		return false
	}

	list = this.factors

	if (n.method == 'amend') {
		if (i + 1 == list.length) {
			list.pop()
			return false
		}

		list[i] = asso
		asso = this.create(n, asso.start, false)
		asso.key = list[i].key || ''
		list[i].key = n.key
		list[i - 1] = asso
		asso.factors = this.build(i)
		this.frozen = this.pos
		return asso.factors != null
	}

	if (n.method == 'infix') {
		if (!n.type) {
			this.err = 'expected type on ' + n.ref + n.tail
			return false
		}

		for (x = i + 1; x < list.length; x++) {
			if (!list[x] || list[x].method == 'note') continue
			asso = list[x]
			break
		}

		if (!asso || !asso.precedence) {
			this.err = 'missing an operator Action with a priority in ' + n.ref + n.tail
			return false
		}

		list[i] = this.create(n, start, false)
		list[i].precedence = asso.precedence
		return true
	}

	if (i + 1 == list.length) {
		list[i] = this.create(n, start, false)
		return true
	}

	asso = i + 2 == list.length && list[i + 1] || null

	// raise the node / action
	if (asso && !asso.key && (asso.raw != null || !asso.type && n.type)) {
		// num    = Number-
		// Number = 1*DIGIT-lit
		if (n.type) asso.type = n.type
		if (n.method) asso.method = n.method
		if (n.key) asso.key = n.key

		list[i] = asso;
		list.pop()
	} else
		list[i] = this.create(n, start, false)

	return true
}

Actions.prototype.repeat = function repeat(n) {
	var c = 0,
		pos = this.pos,
		lene = this.events.length,
		lenf = this.factors.length,
		method = n.ref && (
			this.plugins[n.ref] ||
			n.tail && Action ||
			Ref
		) ||
		n.alts && Choice ||
		n.seqs && Serial ||
		n.raw != null && Text ||
		n.first && Range ||
		n.fields && Binary || null;

	if (!method) {
		this.err = 'unknown rule';
		return this.fail(n)
	}

	while (!this.err && c != n.max && method(n, this)) {
		c++;
		if (c >= n.min) {
			pos = this.pos
			lene = this.events.length
			lenf = this.factors.length
		}
		if (this.pos >= this.end) break
	}

	if (this.err) return this.fail(n)

	if (pos < this.frozen)
		this.err = 'rollback freezes'
	else if (lenf && this.factors[lenf - 1] && this.factors[lenf - 1].end > pos) {
		this.err = 'the Action was unexpectedly changed during the fallback'
	}

	if (this.err) return this.fail(n)

	this.pos = pos
	while (lene != this.events.length) this.events.pop();
	while (lenf != this.factors.length) this.factors.pop();

	return !this.err && c >= n.min || this.fail(n)
}

function Action(n, self) {
	return self.action(n)
}

function Ref(n, self) {
	if (!self.rules[n.ref]) {
		self.err = 'undefined rule ' + n.ref;
		return false
	}
	return self.repeat(self.rules[n.ref])
}

function Choice(n, self) {
	return n.alts.some(self.repeat, self)
}

function Serial(n, self) {
	return n.seqs.every(self.repeat, self)
}

function Text(n, self) {
	// for precedence = ("or") / ("and") / ("")
	if (!n.raw) return false
	if (self.src.substring(self.pos, self.pos + n.raw.length) != n.raw)
		return false
	self.pos += n.raw.length;
	return true
}

function Range(n, self) {
	var code = self.src.charCodeAt(self.pos)
	if (Number.isNaN(code) || code < n.first || code > n.last)
		return false
	self.pos++;
	return true
}

function Binary(n, self) {
	var i = 0,
		src = self.src;

	for (; i < n.fields.length; i++) {
		if (src.charCodeAt(self.pos + i) != n.fields[i])
			return false
	}

	self.pos += i
	return true
}