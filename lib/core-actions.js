"use strict"
var deny = 'expected a string sequence ',
	// built-in plugin
	Plugins = Object.create(null);

module.exports = Actions


Plugins.ACTIONS = function ACTIONS(n, self) {
	if (!n.method) {
		self.err = 'invalid ACTIONS' + n.tail
		return self.fail(n)
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

	self.err = 'invalid ACTIONS' + n.tail
	return self.fail(n)
}

Plugins.EVENT_TRUE = function EVENT_TRUE(self, list, i, n) {
	return true
}

Plugins.DENY = function DENY(n, self) {
	var a = self.factors.length &&
		self.factors[self.factors.length - 1] || null;

	self.err = !n.method && 'invalid' ||
		(!a || !a.raw) && 'expected raw in previous action' ||
		n.method && Deny(self.rules, n.method, a.raw)

	if (!self.err) return true
	self.err += ' on DENY' + n.tail;
	self.fail(n)
	return false
}

function Deny(rules, name, raw) {
	var alts, i, rule = rules[name];
	if (!rule) return 'undefined rule ' + name;

	if (rule.ref) return Deny(rules, rule.ref, raw)

	alts = rule.raw && [rule] || rule.alts

	if (!alts) return deny

	for (i = 0; i < alts.length; i++) {
		rule = alts[i]
		if (rule.ref) {
			name = Deny(rules, rule.ref, raw)
			return name
		}
		if (!rule.raw) return deny
		if (rule.raw == raw) return 'deny ' + raw
	}
}

Plugins.FLAG = function FLAG(n, self) {
	var i, a;
	if (!n.tail) {
		self.err = 'expected flag in FLAG' + n.tail
		return false
	}
	i = self.factors.length
	while (i) {
		a = self.factors[--i]
		if (!a.type || !a.type[3] || a.type[3] == '_')
			continue
		a.flag = n.tail.slice(1)
		return true
	}
	self.err = 'expected type in previous action for FLAG' + n.tail
	return false
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
	if (self.crlf != self.src.substr(self.pos, self.crlf.length))
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
	var a, i;
	if (self.factors.length) {
		self.err = 'OUTDENT must be first action of the factors'
		return self.fail(n)
	}

	if (n.method && !self.rules[n.method]) {
		self.err = 'undefined rule OUTDENT-' + n.method
		return self.fail(n)
	}

	if (n.key && !self.rules[n.key]) {
		self.err = 'undefined rule OUTDENT-' + n.key
		return self.fail(n)
	}

	a = self.before('OUTDENT', n.method, n.key)
	a.loc = Object.create(null)
	i = self.eols.length - 1;
	while (i >= 0 && self.eols[i] > a.start) i--;

	i = (i != -1 && self.eols[i] || 0) - 1
	a.loc.startCol = 1
	while (self.indent == self.src.charCodeAt(i + a.loc.startCol))
		a.loc.startCol++;
	return true
}

Plugins.CRLF_OUTDENT = function CRLF_OUTDENT(n, self) {
	var a, pos, factors, col = 0,
		start = self.pos;

	if (!self.plugins.CRLF_ORIGIN(n, self))
		return false

	if (!self.factors.length || !self.eols.length ||
		!self.isEvent(self.factors[0], 'OUTDENT')) return true
	a = self.factors[0]

	// support multiple blank lines
	while (self.plugins.CRLF_ORIGIN(n, self));
	pos = self.pos
	while (self.indent == self.src.charCodeAt(pos + col))
		col++;
	col++
	if (col < a.loc.startCol) {
		self.break = true
		self.pos = start;
	} else if (col == a.loc.startCol) {
		// allow-break
		if (a.method) {
			factors = self.factors;
			self.factors = [];
			self.pos += col - 1
			self.break = !self.repeat(self.rules[a.method])
			self.pos = pos
			self.factors = factors;
		} else
			self.break = true
	} else if (a.key) {
		// deny
		factors = self.factors;
		self.factors = [];
		self.pos += col - 1
		if (self.repeat(self.rules[a.key])) {
			self.pos = pos + col - 1
			self.break = false
			self.factors = factors;
			return false
		}
		self.pos = pos
		self.break = false
		self.factors = factors;
	}
	if (self.break) self.pos = start;
	return true
}

Plugins.LOAD_OWN = function LOAD_OWN(n, self) {
	self.plugins.OWN = Plugins.OWN
	self.plugins.ON_OWN = Plugins.ON_OWN
	return true
}

Plugins.OWN = function OWN(n, self) {
	if (!n.tail) return false
	self.before('OWN', n.tail.slice(1))
	return true
}

Plugins.ON_OWN = function ON_OWN(self, list, i, a) {
	var x = 0,
		keys = a.method.split('-');
	i++;
	for (; i < list.length; i++) {
		a = list[i]
		if (!a || isNoteOrEvent(a)) continue
		if (a.key == keys[x] && keys.length == ++x) break
	}

	if (x == keys.length) return true
	self.err = 'missing ' + keys[x] + ' on OWN-' + keys.join('-')
	return false
}

// debug
// var ASON = require('./ason');
function echo(list, a) {
	console.log('...... \n', a && JSON.stringify(a) || '');
	//console.log(ASON.serialize(list, 1));return;
	Array.isArray(list) && list.forEach(function(n, i) {
		console.log('\n', i, '\t', JSON.stringify(n))
	}) || console.log(list);
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
	type = 'ON_' + (type || '')

	if (!this.plugins[type]) return false;
	a = Object.create(null)
	a.start = this.pos
	a.end = this.pos
	a.type = type
	if (method) a.method = method
	if (key) a.key = key

	this.events.push(this.factors.length);
	this.factors.push(a)
	return a
}

function isNoteOrEvent(a) {
	return a && (a.method == 'note' ||
		a.type && a.type.substr(0, 3) == 'ON_'
	)
}

Actions.prototype.isNoteOrEvent = isNoteOrEvent

Actions.prototype.isEvent = function isEvent(n, type) {
	return n && n.type == 'ON_' + type
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
	this.err = '';
	this.crlf = '';
	this.break = false;
	this.eols = [];
	this.factors = [];
	this.events = [];
	this.stack = [];
	if (this.plugins.CRLF) setCRLF(this)
}

Actions.prototype.parse = function parse(inputSource, rulename) {
	var ok, loaded = this.loaded;
	this.reset()
	this.src = inputSource
	ok = this.play(this.rules[rulename || this.first])
	if (!loaded && rulename && rulename != this.first)
		this.loaded = false
	else
		this.loaded = true
	return ok
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
	var ok = n && this.repeat(n) && this.pos == this.src.length;
	return ok && this.build(this.factors) ||
		new Error((this.err || 'Actions build failed') + ': ' + failed.call(this))
}

Actions.prototype.fail = function fail(n) {
	if (n.name && this.failNode.offset < this.pos ||
		n.tail && this.failNode.line == -1) {
		this.failNode.line = 0
		this.failNode.offset = this.pos
		this.failNode.rulename = n.name || n.ref
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
	this.failNode.src = this.src.substr(this.failNode.offset, len)
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

Actions.prototype.upperFactors = function upperFactors() {
	return this.stack.length && this.stack[this.stack.length - 1] || null
}

Actions.prototype.build = function build(list) {
	var infix = [];
	if (this.crlf) setLocation(list, this.eols)

	if (this.events.length) {
		if (!emitEvents(this, list, this.events)) {
			this.failNode.line = -1
			return null
		}
		this.events = []
	}

	if (this.err = buildFactors(list, infix)) {
		this.failNode.line = -1
		return null;
	}

	infix.sort(leftToRight).forEach(buildInfix, list);

	return list.filter(non)
}

function emitEvents(ths, list, events) {
	return events.every(function(i) {
		var n = list[i];
		list[i] = null
		return this.plugins[n.type](this, list, i, n)
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

		x = i - 2

		while (x >= 0) {
			n = list[x]
			if (n && n.type && n.method != 'note')
				break
			x--
		}

		if (x == -1) return 'missing action on ahead'

		list[x] = null

		if (n.key || p.key) {
			s = n.key
			n.key = p.key || ''
			p.key = s || ''
		}
		if (n.flag || p.flag) {
			s = n.flag
			n.flag = p.flag || ''
			p.flag = s || ''
		}
		p.start = n.start
		if (p.loc) copyStart(p, n)
		p.factors = [n]

		x++
		while (x < i - 1) {
			if (list[x]) {
				p.factors.push(list[x])
				list[x] = null
			}
			x++
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

	i = 0
	while (i < list.length) {
		p = list[i++]

		if (!p || p.factors) continue;

		if (p.method == 'infix') {
			x = nextPrecedence(list, i)
			if (x == -1) return 'missing precedence on infix'

			n = list[x]
			if (!n.precedence) return 'missing precedence on infix'

			x = nextOperand(list, x + 1)
			if (x == -1) return 'missing operands on infix'

			p.end = list[x].end;
			if (p.loc) copyEnd(p, list[x])

			infix.push([i - 1, n.precedence])
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

		while (i < list.length) {
			n = list[i]
			if (n) {
				if (p.end <= n.start) break
				if (!p.factors) p.factors = [];
				p.factors.push(n)
				list[i] = null
			}
			i++
		}
	}

	return ''
}

function buildInfix(a, j) {
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
		if (raw) a.raw = this.src.slice(start, a.end);
		if (n.type) a.type = n.type;
		if (n.method) a.method = n.method;
		if (n.key) a.key = n.key;
	}

	return a
}

function nextOperand(list, i) {
	var n;
	for (; i < list.length; i++) {
		n = list[i]
		if (n && n.type && !n.precedence && !isNoteOrEvent(n))
			return i
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
	var asso, list, x,
		i = this.factors.length,
		start = this.pos,
		rule = this.rules[n.ref];

	if (!rule) {
		this.err = 'undefined rule ' + n.ref;
		return this.fail(n)
	}

	if (n.method == 'lit') {
		if (n.key && n.type) {
			this.err = 'unsupported action on ' + n.ref + n.tail
			return false
		}

		if (!this.repeat(rule)) return false;

		if (start == this.pos) return true;

		if (n.type) {
			this.factors.push(this.create(n, start, true));
			return true
		}

		asso = i && this.factors[i - 1] || null

		if (asso && !asso.type && asso.method == 'lit' &&
			asso.key == n.key) {
			asso.end = this.pos
			asso.raw += this.src.slice(start, asso.end);
			return true
		}

		this.factors.push(this.create(n, start, true));
		return true
	}

	// alone
	if (n.method == 'alone' || n.method == 'factors') {
		this.branch();
		if (!this.repeat(rule) || start == this.pos) {
			this.revert()
			return false
		}

		list = this.build(this.factors)
		if (!list) {
			this.revert()
			return false
		}

		this.commit()

		if (!n.type && n.method == 'alone' && !list.length)
			return true

		if (n.method == 'alone' && list.length == 1) {
			asso = list[0]
			if (n.type) asso.type = n.type
			if (n.key) asso.key = n.key
		} else {
			asso = this.create(n, start, false);
			if (list.length || n.method == 'factors')
				asso.factors = list
		}

		this.factors.push(asso)
		return true
	}

	if (n.method == 'next') {
		if (!n.key) {
			this.err = 'expected key in ' + n.ref + n.tail
			return false
		}

		if (!this.repeat(rule) || i == this.factors.length)
			return false
		if (start == this.pos) return true

		list = this.factors
		x = nextOperand(list, i)
		if (x == -1) {
			while (i != list.length) list.pop();
			return false
		}

		asso = list[x]
		asso.key = n.key
		return true
	}

	if (n.method == 'precedence') {
		if (!n.key) {
			this.err = 'expected key in ' + n.ref + n.tail
			return false
		}

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

	if (!n.type && (!n.method || !n.key || n.method == 'push')) {

		if (!this.repeat(rule)) return false
		if (i == list.length) return true
		asso = list[i]
		if (asso.method || n.method) asso.method = n.method || ''
		if (asso.key || n.key) asso.key = n.key || ''
		return true
	}

	if (!n.type && !n.key) {
		this.err = 'unsupported action on ' + n.ref + n.tail
		return false
	}

	list.push(null)

	if (!this.repeat(rule)) {
		list.pop()
		return false
	}

	if (i + 1 == list.length) {
		// chain        = Ident- CallExpr-ahead-callee-
		// CallExpr     = "(" [arguments] ")"
		if (start != this.pos)
			list[i] = this.create(n, start, false)
		else
			list.pop();
		return true
	}

	asso = list[i + 1]

	if (!n.type || !asso.raw || asso.type || asso.key) {
		list[i] = this.create(n, start, false)
		return true
	}

	// num    = Number-
	// Number = 1*DIGIT-lit
	asso.type = n.type
	if (n.method) asso.method = n.method
	if (n.key) asso.key = n.key

	for (x = 0; x < this.events.length; x++) {
		if (this.events[x] >= i) this.events[x]--
	}

	while (i < list.length) list[i] = list[++i];
	list.pop()
	return true
}

Actions.prototype.repeat = function repeat(n) {
	var c = 0,
		pos = this.pos,
		max = !n.rep && 1 || n.rep.max || -1,
		method = n.ref && (
			this.plugins[n.ref] && Plugin ||
			n.tail && this.action ||
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

	while (!this.err && c != max && method.call(this, n)) {
		c++;
		if (this.break || this.pos >= this.src.length)
			break
	}

	if (this.err) {
		this.pos = pos
		return this.fail(n)
	}

	if (this.break) {
		this.break = false
		if (this.pos == pos) return this.fail(n)
	}

	if (c >= (!n.rep && 1 || n.rep.min))
		return true;

	this.pos = pos
	return this.fail(n)
}

function Plugin(n) {
	return this.plugins[n.ref](n, this)
}

function Ref(n) {
	if (!this.rules[n.ref]) {
		this.err = 'undefined rule ' + n.ref;
		return this.fail(n)
	}
	return this.repeat(this.rules[n.ref])
}

function Choice(n) {
	return n.alts.some(function(n) {
		return this.repeat(n)
	}, this);
}

function Serial(n) {
	var pos = this.pos,
		len = this.factors.length;
	if (n.seqs.every(function(n) {
			return this.repeat(n) && !this.break
		}, this))
		return true;

	if (this.break) {
		this.break = false
		return true
	}

	this.pos = pos

	while (len != this.factors.length)
		this.factors.pop();
	return false
}

function Text(n) {
	// for precedence = ("or") / ("and") / ("")
	if (!n.raw) return false
	if (this.src.substr(this.pos, n.raw.length) != n.raw)
		return false
	this.pos += n.raw.length;
	return true
}

function Range(n) {
	var code = this.src.charCodeAt(this.pos)
	if (Number.isNaN(code) || code < n.first || code > n.last)
		return false
	this.pos++;
	return true
}

function Binary(n) {
	return n.fields.every(function(code, i) {
		return this.src.charCodeAt(this.pos + i) == code
	}, this) && (this.pos += n.fields.length) && true || false
}