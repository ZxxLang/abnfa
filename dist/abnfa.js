(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.ABNFA = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';
var core = require('./lib/core')

exports.ASON = require('./lib/ason')
exports.Trans = core.Trans
exports.Rules = core.Rules
exports.Retrans = core.Retrans
exports.Entries = core.Entries
exports.Actions = core.Actions
exports.tokenize = core.tokenize

},{"./lib/ason":2,"./lib/core":5}],2:[function(require,module,exports){
"use strict"

// The ABNFA Abstract Actions Tree Object Notation (ASON) Data Interchange Format
//
// protocol     = "ASON:[" ASON "]"
// ASON         = action *("," action)
// action       = [type [flag]] [key] (rawstring / factors)
//
// FlagMark     = "-" ; markup for  flag
// NoteMark     = "!" ; markup for 'note' method
// ListMark     = "+" ; markup for 'list' method
// OtherMark    = "~" ; markup for  other method
//
// type         = name
// key          = (NoteMark / ArrayMark / OtherMark) name
// flag         = FlagMark 1*(ALPHA / DIGIT / "_" / "-")
//
// rawstring    = DQUOTE 1*char DQUOTE
// factors      = "[" [ASON] "]"
//
// name         = 1*(ALPHA / DIGIT / "_")
//
// char         = unescaped / escape (
//                %x22 /          ; "    quotation mark  U+0022
//                %x2F /          ; /    solidus         U+002F
//                %x5C /          ; \    reverse solidus U+005C
//                %x62 /          ; b    backspace       U+0008
//                %x66 /          ; f    form feed       U+000C
//                %x6E /          ; n    line feed       U+000A
//                %x72 /          ; r    carriage return U+000D
//                %x74 /          ; t    tab             U+0009
//                %x75 4HEXDIG )  ; uXXXX                U+XXXX
// escape       = %x5C            ; \
// unescaped    = %x20-21 / %x23-5B / %x5D-10FFFF
// ALPHA        = %x41-5A / %x61-7A
// DIGIT        = %x30-39
// DQUOTE       = %x22            ; "


function Serializer(asonHead, indent) {
    this.asonHead = asonHead && true || false
    this.indent = indent && 1 || 0
    this.prefix = indent && '\t'.repeat(indent - 1) || ''
}

Serializer.prototype.serialize = function(actions) {
    this.ason = '';
    actions && actions.length && actions.forEach(walk, this)
    return this.asonHead && this.prefix + 'ASON:[' + this.ason + ']' ||
        this.ason;
}

function walk(a, i) {
    this.ason += property(this.prefix + (i && ',' || ''), a);
    if (a.raw != null || !a.factors) return
    if (!a.factors.length) return this.ason += '[]';

    this.indent && this.indent++;
    this.ason += '[';
    a.factors.forEach(walk, this)
    this.ason += ']'
    this.indent && this.indent--;
}

function property(ason, a) {
    if (!a) return ason + '.'
    if (a.method == 'note')
        ason += '!'

    if (a.flag && a.flag[0] == '+')
        ason += '+'
    if (a.type)
        ason += a.type
    if (a.flag)
        ason += a.flag[0] != '+' && a.flag ||
        a.flag.slice(1)

    if (a.key)
        ason += '~' + a.key

    if (a.raw != null)
        ason += JSON.stringify(a.raw)
    return ason
}

function stringify(actions, indent) {
    if (!indent) return 'ASON:[' + serialize(actions) + ']'
    return (new Serializer(true, indent)).serialize(actions)
}

function serialize(actions) {
    return actions.reduce(function(ason, a, i) {
        if (!a)
            throw new Error('ASON serialize failed, missing an Action')

        if (i)
            ason += ','

        if (a.type)
            ason += a.type
        if (a.flag)
            ason += a.flag

        if (a.key)
            ason += (
            a.method == 'list' && '+' ||
            a.method == 'note' && '!' || '~'
            ) + a.key

        if (a.raw != null)
            ason += JSON.stringify(a.raw)
        else if (a.factors)
            ason += '[' + serialize(a.factors) + ']'

        return ason
    }, '')
}


function clean(actions) {
    return actions.reduce(function(list, a, i) {
        var o = Object.create(null);

        if (!a)
            throw new Error('ASON clean failed, missing an Action')

        list.push(o)

        if (a.type)
            o.type = a.type

        if (a.key) {
            o.key = (
            a.method == 'list' && '+' ||
            a.method == 'note' && '!' || '~'
            ) + a.key
        }


        if (a.flag)
            o.flag = a.flag

        if (a.raw != null)
            o.raw = a.raw
        else if (a.factors)
            o.factors = clean(a.factors)

        return list
    }, [])
}

exports.stringify = stringify
exports.serialize = serialize
exports.clean = clean

},{}],3:[function(require,module,exports){
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
		if (typeof self.Plugins['ON_' + n.method] == 'function')
			self.plugins['ON_' + n.method] = self.Plugins['ON_' + n.method]
		return true
	}

	if (typeof Plugins['LOAD_' + n.method] == 'function')
		return Plugins['LOAD_' + n.method](n, self)

	if (typeof Plugins[n.method] == 'function') {
		self.plugins[n.method] = Plugins[n.method]
		if (typeof Plugins['ON_' + n.method] == 'function')
			self.plugins['ON_' + n.method] = Plugins['ON_' + n.method]
		return true
	}

	self.err = 'unsupported ' + n.ref + n.tail
	return false
}

Plugins.EVENT_TRUE = function EVENT_TRUE(self, list, n) {
	return true
}

Plugins.POP = function POP(n, self) {
	self.before('POP')
	return true
}

Plugins.ON_POP = function ON_POP(self, list, n) {
	if (n.index && n.index <= list.length)
		list[n.index - 1] = null
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
	self.frozen = self.pos
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

function setLocation(list, eols, x) {
	var n, i = 0;
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

	// deny zero indent
	if (n.method == '0') a.key = '0'

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

	if (!col && event.key ||
		col < event.loc.startCol ||
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
	if (this.crlf) setLocation(this.factors, this.eols, from)

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

Actions.prototype.precedence = function precedence(rule, start) {
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
		if (this.src.substring(start, start + a[i][0].length) == a[i][0]) {
			this.pos = start + a[i][0].length
			return a[i][1]
		}
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

	if (n.method == 'binary') {
		if (!n.key) {
			this.err = 'expected key on ' + n.ref + n.tail
			return false
		}

		x = this.precedence(rule, start)
		if (!x) return false
		asso = this.create(n, start, true)
		asso.precedence = x
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
	if (n.method == 'alone' || n.method == 'body' || n.method == 'list') {
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

	if (n.method == 'ifn') return !this.repeat(rule)

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

		if (!n.type) {
			list.pop();
			// stmt     = Ident- assign-amend-left
			// assign   = Assign-factors-
			// Assign   = OUTDENT leftMore-list-left ...
			if (!this.repeat(rule)) {
				list.push(asso)
				return false
			}

			i--
			list = this.factors

			if (!list[i] || !list[i].factors) {
				this.err = 'expected an Action.factors inside ' + n.ref + n.tail
				return false
			}
			// find key
			this.factors[i].factors.some(function(a, x) {
				if (a.key != n.key) return false
				if (a.factors) {
					list = this.factors[i].factors
					i = x
				} else
					this.err = 'expected an Action.factors inside '
				return true
			}, this)

			if (this.err) {
				this.err += n.ref + n.tail
				return false;
			}
			// amend
			list[i].start = asso.start
			list[i].factors.unshift(asso)
			if (list[i].loc) {
				setLocation([asso], this.eols, 0)
				list[i].loc.startLine = asso.loc.startLine
				list[i].loc.startCol = asso.loc.startCol
			}

			this.frozen = this.pos
			return true
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
		this.frozen = this.pos;
		// type and key
		// selector = Ident ["." Selector-amend-left-]
		// Selector = Ident--right DENY-CONSTS-SIV
		if (!list[i + 1]) {
			this.err = 'expected an Action inside ' + n.ref + n.tail
			return false
		}

		list[i] = asso
		asso = this.create(n, asso.start, false)
		asso.key = list[i].key || ''
		list[i].key = n.key
		list[i - 1] = asso
		asso.factors = this.build(i)
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
	while (lene < this.events.length) this.events.pop();
	while (lenf < this.factors.length) this.factors.pop();

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
},{"./ason":2}],4:[function(require,module,exports){
"use strict"
var helper = require('./helper');

function create() {
	return Object.create(null)
}

function Rules() {
	// Rules receive the entire of tokens of a rule by
	//  the retrans method to build a rule and results bare-Object by .bare().
	//
	// .first 	the name of first Rule
	// .defs  	key value pairs object {def-rule-name: rule-elements}
	// .comments [comment] the comment does not contain a CRLF
	//
	// The following attributes are used for analysis.
	//
	// .refs
	// .deps
	// .undefs
	// .unrefs
	// .literals
	// .comments
	//
	// Prototypes
	//
	// Comment  { raw: String }
	//
	// Rule {
	//     name: String,
	//     min: 1,
	//     max: 1,
	//     alts: [ serial | ref | text | range | binary | choice]
	// }
	//
	// Choice {
	//     min: Number,
	//     max: Number,
	//     alts: [ serial | ref | text | range | binary ]
	// }
	//
	// Serial {
	//     min: Number,
	//     max: Number,
	//     seqs: [ serial | ref | text | range | binary | choice ]
	// }
	//
	// Action {
	//     min: Number,
	//     max: Number,
	//     ref: String,
	//     tail: String,
	//     type: String,
	//     method: String,
	//     key: String,
	// }
	//
	// Text {
	//     min: Number,
	//     max: Number,
	//     formal: "" | "s" | "i",
	//     raw: String
	// }
	//
	// Range {
	//     min: Number,
	//     max: Number,
	//     radix: 2 | 10 | 16,
	//     first: Int( 1*BIT | 1*DEC | 1*HEX ),
	//     last: Int( 1*BIT | 1*DEC | 1*HEX )
	// }
	//
	// Binary {
	//     min: Number,
	//     max: Number,
	//     radix: 2 | 10 | 16,
	//     fields: [ Int( 1*BIT | 1*DEC | 1*HEX ) ]
	// }
	//
	// BIT  "0" | "1"
	// DEC  "0"-"9"
	// HEX  "0"-"9" | "A" - "F" | "a" - "f"
	//

	this.defs = create()
	this.refs = create()
	this.deps = create()
	this.literals = []
	this.comments = []
}

Rules.prototype.addAction = function(ref) {
	var name = ref.ref,
		a = this.refs[name] = this.refs[name] || []

	a.indexOf(this.current) == -1 && a.push(this.current)

	a = this.deps[this.current] = this.deps[this.current] || []
	a.indexOf(name) == -1 && a.push(name)

	return ref
}

Rules.prototype.addLit = function(lit) {
	if (this.literals.indexOf(lit.raw) == -1)
		this.literals.push(lit.raw)
	return lit
}

Rules.prototype.bare = function bare() {
	// results an bare object with no prototype
	var k, n = create()
	n.first = this.first
	n.unrefs = []
	n.undefs = []

	n.defs = create()
	for (k in this.defs) {
		n.defs[k] = this.defs[k].bare();
		if (k != n.first && !this.refs[k]) n.unrefs.push(k);
	}

	n.refs = create()
	for (k in this.refs) {
		n.refs[k] = this.refs[k].slice();
		if (!n.defs[k]) n.undefs.push(k);
	}

	n.deps = create()
	for (var k in this.deps)
		n.deps[k] = this.deps[k].slice();

	n.literals = this.literals.slice();

	n.comments = this.comments.map(function(c) {
		return c.bare()
	})
	return n
}

Rules.prototype.retrans = function retrans(toks) {
	var tok, k;
	// clear placeholder and delimitation tokens
	if (toks == null) {
		this.current = null
		this.literals.sort();
		for (k in this.refs) this.refs[k].sort();
		for (k in this.deps) this.deps[k].sort();
		return this.bare()
	}

	toks = toks.filter(function(tok) {
		return ['wsp', 'crlf', '"', "'", '%b', '%d', '%x', '%s', '%i']
			.indexOf(tok.form || tok.raw) == -1
	}, this)

	if (!toks.length) return

	if (toks[0].form == 'comment') {
		for (var i = 0; i < toks.length; i++)
			this.comments.push(new Comment(toks[i]));
		return
	}

	var rule = new Rule(toks[0].raw)

	toks = toks.filter(function(tok) {
		if (tok.form == 'comment') {
			if (!this.comments) this.comments = []
			this.comments.push(new Comment(tok));
			return false
		}
		return true
	}, rule)

	tok = toks[1]

	if (tok.raw == '=') {
		if (this.defs[rule.name])
			return helper.syntaxError(
				'unexpected duplicates rule', rule.name, rule.start)
	} else if (!this.defs[rule.name])
		return helper.syntaxError(
			'unexpected incremental rule', rule.name, rule.start)

	this.current = rule.name
	this.first = this.first || rule.name

	var alts = new Choice(1, 1);
	toks = reduce(this, alts, toks.slice(2), '')

	if (this.error) return this.error

	if (toks.length) return helper.syntaxError(
		'unexpected token', toks[0].raw, toks[0].start)

	if (this.defs[rule.name]) {

		this.defs[rule.name].alts =
			this.defs[rule.name].alts.concat(alts.alts);

		if (rule.comments) {
			if (!this.defs[rule.name])
				this.defs[rule.name].comments = rule.comments
			else {
				this.defs[rule.name].comments =
					this.defs[rule.name].comments.concat(rule.comments)
			}
		}
	} else {
		rule.alts = alts.alts
		this.defs[rule.name] = rule
	}
}

function reduce(r, alts, toks, close) {
	// alternatives
	var l, min, max, first, form, alt;
	var seqs = new Serial(1, 1);

	while (toks.length) {

		l = toks.length
		first = toks[0]
		form = first.form || first.raw

		if (close && form == close[0]) {
			toks = toks.slice(1)
			break
		}

		if (form == '/') {
			alts.push(seqs)
			toks = toks.slice(1)
			continue
		}

		if (form == 'repeat') {
			if (first.raw == '*') {
				min = 0
				max = -1
			} else {
				min = first.raw.indexOf('*') + 1
				if (!min) {
					min = parseInt(first.raw)
					max = min
				} else {
					max = parseInt(first.raw.substring(min)) || -1
					min = min != 1 && parseInt(first.raw) || 0
				}
			}

			l--
			toks = toks.slice(1)
			first = toks[0]
			form = first.form || first.raw
		} else {
			min = 1
			max = 1
		}

		switch (form) {
			case 'rulename':
				seqs.push(r.addAction(new Action(first, min, max)))
				toks = toks.slice(1)
				break
			case 'string':
				seqs.push(r.addLit(new Text(first, min, max, '')))
				toks = toks.slice(1)
				break
			case '[':
				l--
				alt = new Choice(0, 1)
				toks = reduce(r, alt, toks.slice(1), ']' + close);
				if (alt.alts.length) seqs.push(alt)
				break
			case '(':
				l--
				alt = new Choice(min, max)
				toks = reduce(r, alt, toks.slice(1), ')' + close);
				if (alt.alts.length) seqs.push(alt)
				break
			case '<':
				l--
				alt = new Choice(min, max)
				toks = reduce(r, alt, toks.slice(1), '>' + close);
				if (alt.alts.length) seqs.push(alt)
				break
			case 'b':
			case 'd':
			case 'x':
				seqs.push(num(first, min, max, form))
				toks = toks.slice(1)
				break
			case 'i':
			case 's':
				seqs.push(r.addLit(new Text(first, min, max, form)))
				toks = toks.slice(1)
				break
		}

		if (r.error || l == toks.length) break
	}

	if (!r.error && seqs.seqs.length) alts.push(seqs)
	return toks
}

function Rule(raw) {
	this.min = 1
	this.max = 1
	this.alts = []
	this.name = raw
}

Rule.prototype.bare = function bare() {
	var n = Choice.prototype.bare.call(this);
	n.name = this.name
	return n
}

function Comment(tok) {
	this.raw = tok.raw
}

Comment.prototype.bare = function bare() {
	var n = create()
	n.raw = this.raw
	return n
}

function Action(tok, min, max) {
	var actions = tok.raw.split('-');
	this.min = min
	this.max = max
	this.ref = actions.shift()
	if (!actions.length) return
	this.tail = tok.raw.slice(this.ref.length);

	// ref-method-key-type
	// ref-to-key- ---> ref-to-key-ref
	if (actions.length && !actions[actions.length - 1]) {
		this.type = this.ref
		actions.pop()
		if (actions.length) this.method = actions.shift()
		if (actions.length) this.key = actions.shift()
	} else {
		if (actions.length) this.method = actions.shift()
		if (actions.length) this.key = actions.shift()
		if (actions.length) this.type = actions.shift()
	}

	if (this.key == 'to') this.key = ''
}

Action.prototype.bare = function bare() {
	var n = create();
	n.min = this.min
	n.max = this.max
	n.ref = this.ref
	if (this.tail) {
		n.tail = this.tail
		if (this.type) n.type = this.type
		if (this.method) n.method = this.method
		if (this.key) n.key = this.key
	}
	return n
}

function Text(tok, min, max, formal) {
	this.min = min
	this.max = max
	if (formal) this.formal = formal
	this.raw = tok.raw
}

Text.prototype.bare = function bare() {
	var n = create()
	n.min = this.min
	n.max = this.max
	if (this.formal) n.formal = this.formal
	n.raw = this.raw
	return n
}

function num(tok, min, max, formal) {
	var radix = formal == 'b' && 2 || formal == 'd' && 10 || 16
	if (tok.raw.indexOf('-') != -1)
		return new Range(tok, min, max, radix)

	return new Binary(tok, min, max, radix)
}

function Binary(tok, min, max, radix) {
	this.min = min
	this.max = max
	this.radix = radix
	this.fields = tok.raw.split('.').map(function(s) {
		return parseInt(s, radix)
	})
}

Binary.prototype.bare = function bare() {
	var n = create()
	n.min = this.min
	n.max = this.max
	n.radix = this.radix
	n.fields = this.fields.slice(0)
	return n
}

function Range(tok, min, max, radix) {
	var mm = tok.raw.split('-');
	this.min = min
	this.max = max
	this.radix = radix
	this.first = parseInt(mm[0], radix)
	this.last = parseInt(mm[1], radix)
}

Range.prototype.bare = function bare() {
	var n = create()
	n.min = this.min
	n.max = this.max
	n.radix = this.radix
	n.first = this.first
	n.last = this.last
	return n
}

function Choice(min, max) {
	this.min = min
	this.max = max
	this.alts = []
}

Choice.prototype.bare = function bare() {
	var n;
	if (this.alts.length == 1) {
		if (this.min == 1 && this.max == 1) return this.alts[0].bare()

		if (this.alts[0].min == 1 && this.alts[0].max == 1) {
			n = this.alts[0].bare()
			n.min = this.min
			n.max = this.max
			return n
		}
	}

	n = create()
	n.min = this.min
	n.max = this.max
	n.alts = this.alts.map(function(o) {
		return o.bare()
	})
	return n
}

Choice.prototype.push = function(n) {
	// n instanceof Serial
	if (n.seqs.length == 1 && n.min == 1 && n.max == 1) {
		var m = n.seqs[0]; // support precedences
		if (m instanceof Choice && m.min == 1 && m.max == 1 && !m.alts[0].raw) {
			this.alts = this.alts.concat(m.alts)
		} else
			this.alts.push(m)

		n.seqs = []
		return
	}
	var m = new Serial(n.min, n.max)
	m.seqs = n.seqs
	n.seqs = []
	this.alts.push(m)
	return
}

function Serial(min, max) {
	this.min = min
	this.max = max
	this.seqs = []
}

Serial.prototype.bare = function bare() {
	var n;
	if (this.seqs.length == 1) {
		if (this.min == 1 && this.max == 1) return this.seqs[0].bare()

		if (this.seqs[0].min == 1 && this.seqs[0].max == 1) {
			n = this.seqs[0].bare()
			n.min = this.min
			n.max = this.max
			return n
		}
	}

	n = create()
	n.min = this.min
	n.max = this.max
	n.seqs = this.seqs.map(function(o) {
		return o.bare()
	})

	return n
}

Serial.prototype.push = function(n) {

	if (n instanceof Choice) {
		var m = n.alts[0]
		if (n.alts.length == 1 && n.min == 1 && n.max == 1) {
			if (m instanceof Serial && m.min == 1 && m.max == 1) {
				this.seqs = this.seqs.concat(m.seqs)
			} else
				this.seqs.push(m)

			n.alts = []
			return
		}

		m = new Choice(n.min, n.max)
		m.alts = n.alts
		n.alts = []
		this.seqs.push(m)
		return
	}

	this.seqs.push(n)
}

Rules.Rule = Rule
Rules.Comment = Comment
Rules.Action = Action
Rules.Text = Text
Rules.Binary = Binary
Rules.Range = Range
Rules.Choice = Choice
Rules.Serial = Serial

module.exports = Rules
},{"./helper":6}],5:[function(require,module,exports){
"use strict"
var helper = require('./helper');

function alpha(c) {
    return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z'
}

function bit(c) {
    return c == '0' || c == '1'
}

function digit(c) {
    return c >= '0' && c <= '9'
}

function hexdig(c) {
    return c >= '0' && c <= '9' || c >= 'a' && c <= 'f' ||
        c >= 'A' && c <= 'F'
}

function vchar(c) {
    // for comment only
    return c == 0x09 || uvchar(c)
}

function quote(c) {
    return c != 0x27 && uvchar(c)
}

function string(c) {
    return c != 0x22 && uvchar(c)
}

function uvchar(c) {
    //  UNICODE VCHAR
    return c >= 0x20 && c <= 0x7E ||
        c >= 0x00A1 && c <= 0x167F || c >= 0x1681 && c <= 0x1FFF ||
        c >= 0x200B && c <= 0x2027 || c >= 0x202A && c <= 0x202E ||
        c >= 0x2030 && c <= 0x205E || c >= 0x2060 && c <= 0x2FFF ||
        c >= 0x3001 && c <= 0xD7FF ||
        c >= 0xF900 && c <= 0xFDCF || c >= 0xFDF0 && c <= 0xFFFD ||
        c >= 0x10000 && c <= 0x1FFFD || c >= 0x20000 && c <= 0x2FFFD ||
        c >= 0x30000 && c <= 0x3FFFD || c >= 0x40000 && c <= 0x4FFFD ||
        c >= 0x50000 && c <= 0x5FFFD || c >= 0x60000 && c <= 0x6FFFD ||
        c >= 0x70000 && c <= 0x7FFFD || c >= 0x80000 && c <= 0x8FFFD ||
        c >= 0x90000 && c <= 0x9FFFD || c >= 0xA0000 && c <= 0xAFFFD ||
        c >= 0xB0000 && c <= 0xBFFFD || c >= 0xC0000 && c <= 0xCFFFD ||
        c >= 0xD0000 && c <= 0xDFFFD || c >= 0xE0000 && c <= 0xEFFFD ||
        c == 0x00A0 || c == 0x1680 || c >= 0x2000 && c <= 0x200A ||
        c == 0x202F || c == 0x205F || c == 0x3000
}

function toTok(start, form, raw) {
    var tok = {
        form: form,
        raw: raw,
        start: {
            offset: start.offset,
            line: start.line,
            col: start.col
        }
    }
    start.offset += raw.length
    if (form == 'crlf') {
        start.line++;
        start.col = 0
    } else {
        start.col += raw.length
    }
    return tok
}

function Retrans(...next) {
    // Retrans is compatible with continuous reduce or transform behavior.
    //     reduce
    //          .retrans(any)  results null | Error
    //          .retrans(null) results Object | Array | Error
    //
    //     transform
    //          .retrans(any)  results Object | Array | Error
    //          .retrans(null) results null | Error
    //
    // next  .prototype.retrans or .retrans
    //
    // .retrans(any)
    //     results
    //         Error    on any error
    //         array    if !next.length
    //         any      next.retrans(array) || next.retrans(null)
    //
    // Example for transform
    //     var form = {};
    //     form.retrans = function(s) {
    //         return s!=null && s + s || null
    //     }
    //     var ret = new Retrans(Trans, form);
    //     ret.retrans(1)
    //     ret.retrans(2)
    //     ret.retrans(null)
    //     [2, 4]
    //
    this.next = next.map(function(n) {
        return helper.retrans(n)
    }).filter(function(n) {
        return n
    })

    this.list = []
}

Retrans.prototype.retrans = function retrans(any) {
    if (null != any) {
        if (any instanceof Error) return any
        this.list.push(any)
        return
    }

    return this.next.reduce(function(v, c, i) {
        if (null == v || v instanceof Error) return v
        if (!i || !(v instanceof Array))
            return c.retrans(v) || c.retrans(null)

        var r, list = []
        for (i = 0; i < v.length; i++) {
            r = c.retrans(v[i])
            if (r instanceof Error) return r
            if (null != r) list.push(r) // transform and filter
        }

        r = c.retrans(null)
        if (!list.length) return r; // reduce
        // transform and filter
        if (null != r) list.push(r);
        return list.length && list || null
    }, this.list)
}

function Trans() {
    // .retrans(any) results any
}

Trans.prototype.retrans = function retrans(any) {
    return any
}

function Entries() {
    // entries is simple splitter through rulename and comment / c-wsp
    //
    // .retrans(tokens)
    //     reduce and results [tokens]:
    //         [c-nl ...]           tokens of un-rule
    //         [rulename, c-nl ...] tokens of a rule
    //         null                 on <<EOF>>
    this.entries = []
}

Entries.prototype.retrans = function retrans(tokens) {
    var i, j, rule;
    if (null == tokens) return this.entries

    for (i = 0; i < tokens.length;) {
        rule = null;
        for (j = i; j < tokens.length; j++)
            if (tokens[j].form == 'rulename') {
                rule = tokens[j]
                break
            }

        i != j && this.entries.push(tokens.slice(i, j))
        if (!rule) break

        i = j
        for (j++; j < tokens.length; j++)
            if (tokens[j].start.col <= rule.start.col &&
                ['wsp', 'crlf'].indexOf(tokens[j].form) == -1) break

        this.entries.push(tokens.slice(i, j))
        i = j
    }
}

function tokenize(s, ...collector) {
    // tokenize is a lexical parser, merge consecutive spaces and htab.
    //
    // s          ABNF strings
    // collector  token collector, collector = new Retrans(...collector)
    //
    // results
    //     SyntaxError    on syntax error
    //     any            collector.push(token || null)
    //
    // token {
    //     form: String(formal-sring),
    //     raw: String(raw-sring),
    //     start: {
    //         offset: Number(offset),
    //         line: Number(line),
    //         col: Number(column-on-the-line)
    //     }
    // }
    //
    // formal       raw
    // ''           '('
    // ''           ')'
    // ''           '/'
    // ''           '['
    // ''           ']'
    // ''           '"'
    // ''           "'"
    // ''           '<'
    // ''           '>'
    // ''           '%s'
    // ''           '%i'
    // ''           '%b'
    // ''           '%d'
    // ''           '%x'
    // '='          "=" / "=/"
    // 'wsp'        1*(1*%x09 / 1*%x20)
    // 'crlf'       (%x0D %x0A) / %x0D / %x0A ; crlf / cr / lf
    // 'b'          1*BIT [ 1*("." 1*BIT) / ("-" 1*BIT) ]
    // 'd'          1*DIGIT [ 1*("." 1*DIGIT) / ("-" 1*DIGIT) ]
    // 'x'          1*BIT [ 1*("." 1*BIT) / ("-" 1*BIT) ]
    // 'string'     *(%x20-7E) ; quoted string, DQUOTE and QUOTE
    // 's'          *(%x20-7E) ; %s string
    // 'i'          *(%x20-7E) ; %i string
    // 'repeat'     1*HEXDIG / (*HEXDIG "*" *HEXDIG)
    // 'comment'    ";" *(WSP / VCHAR)
    // 'rulename'   ALPHA *(ALPHA / DIGIT / "-")
    var prob, i = s.search(/\r\n|\n|\r/),
        crlf = (i == -1 || s[i] == '\n') && '\n' ||
        s[i + 1] == '\n' && '\r\n' || '\r';

    var start = {
        offset: 0,
        line: 1,
        col: 0
    }

    collector = new Retrans(...collector);

    var rcol = 0,
        defas = -1,
        prev = '',
        right = '';

    var x, l, form, c, valid;
    i = 0
    while (i < s.length) {
        l = i
        form = ''
        c = s[i]
        if (c == ' ' || c == '\t') {
            l++
            form = 'wsp'
            while (s[l] == ' ' || s[l] == '\t') l++
        } else if (c == '\r' || c == '\n') {
            form = 'crlf'
            l += crlf.length
                // if (s.slice(i, l) != crlf)
                //     return helper.syntaxError('unexpected symbols', s.slice(i, l), start)
        } else if (c == ';') {
            form = 'comment'
            l++
            while (vchar(s.charCodeAt(l))) l++;
        } else if (alpha(c)) {
            form = 'rulename'
            if (start.col <= rcol || defas == -1) {

                if (right) return helper.syntaxError(
                    'unexpected incomplete matching brackets previous rule',
                    s.slice(i).split(crlf, 1)[0], start);

                if (!defas || ')]>rnt'.indexOf(prev) == -1)
                    return helper.syntaxError(
                        'unexpected incomplete previous rule',
                        s.slice(i).split(crlf, 1)[0], start);

                defas = 0
                rcol = start.col
                prev = 'd' // def
            } else if (defas == 1)
                prev = 'r' // ref
            else return helper.syntaxError(
                'expected defined-as', s.slice(i, l), start)
            l++
            c = 0
            while (alpha(s[l]) || digit(s[l]) || s[l] == '-' || c && s[l] == '_') {
                if (s[l] == '-') {
                    c=1
                    if (!defas) return helper.syntaxError(
                        'unexpected rulename includes "-"', s.slice(i, l), start)
                }
                l++;
            }
        } else if (start.col <= rcol) {
            return helper.syntaxError(
                'unexpected symbols', s.slice(i).split(crlf, 1)[0], start);

        } else if (c == '/') {
            if (start.col <= rcol || ')]>rnt'.indexOf(prev) == -1) return helper.syntaxError(
                'unexpected incremental alternatives',
                s.slice(i).split(crlf, 1)[0], start);

            prev = c
            l++
        } else if (')]>'.indexOf(c) != -1) {

            if (c != right[0]) return helper.syntaxError(
                c == '>' &&
                'unexpected incomplete matching angle brackets previous rule' ||
                'unexpected incomplete matching brackets previous rule',
                s.slice(i).split(crlf, 1)[0], start);

            right = right.slice(1)
            prev = c
            l++
        } else if (c == '(') {
            right = ')' + right
            prev = c
            l++
        } else if (c == '[') {
            right = ']' + right
            prev = c
            l++
        } else if (c == '<') {
            right = '>' + right
            prev = c
            l++
        } else if (c == '*' || digit(c)) {
            prev = '*'
            form = 'repeat'
            l++
            while (digit(s[l])) l++;
            if (c != '*' && s[l] == '*') {
                l++
                while (digit(s[l])) l++;
            }
            c = s[l]
            if (!alpha(c) && '(%"\'<'.indexOf(c) == -1)
                return helper.syntaxError(
                    'unexpected symbols after repeat', s.slice(i).split(crlf, 1)[0], start);

        } else if (c == '"') {
            prev = 't'
            l++
            while (string(s.charCodeAt(l))) l++;
            if (s[l] != c)
                return helper.syntaxError(
                    'expected DQUOTE *(%x20-21 / %x23-7E) DQUOTE',
                    s.slice(i).split(crlf, 1)[0], start);

            prob = collector.retrans(toTok(start, '', c)) ||
                collector.retrans(toTok(start, 'string', s.slice(i + 1, l))) ||
                collector.retrans(toTok(start, '', c))

            if (prob) return prob

            l++
            i = l
            continue
        } else if (c == "'") {
            prev = 't'
            l++
            while (quote(s.charCodeAt(l))) l++;
            if (s[l] != c)
                return helper.syntaxError(
                    'expected QUOTE *(%x20-26 / %x28-7E) QUOTE',
                    s.slice(i).split(crlf, 1)[0], start);

            prob = collector.retrans(toTok(start, '', c)) ||
                collector.retrans(toTok(start, 'string', s.slice(i + 1, l))) ||
                collector.retrans(toTok(start, '', c))

            if (prob) return prob

            l++
            i = l
            continue
        } else if (c == '=') {
            form = c;
            if (defas || prev != 'd')
                return helper.syntaxError('unexpected defined-as', s.slice(i, l), start)
            defas = 1
            prev = c
            l += s[i + 1] == '/' && 2 || 1
        } else if (c == '%') {
            c = s[l + 1]
            if (c == 'i' || c == 's') {
                prev = 't'
                l += 2
                if (s[l] == '"') {
                    l++
                    while (string(s.charCodeAt(l))) l++;
                }

                if (s[l] != '"') return helper.syntaxError(
                    'expected ("%i" / "%s") DQUOTE *(%x20-21 / %x23-7E) DQUOTE',
                    s.slice(i).split(crlf, 1)[0], start)

                prob = collector.retrans(toTok(start, '', s.slice(i, i + 2))) ||
                    collector.retrans(toTok(start, '', '"')) ||
                    collector.retrans(toTok(start, c, s.slice(i + 3, l))) ||
                    collector.retrans(toTok(start, '', '"'))

                if (prob) return prob
                l++
                i = l
                continue
            } else if (c == 'b' || c == 'd' || c == 'x') {
                prev = 'n'
                l += 2
                form = c
                valid = c == 'b' && bit || c == 'd' && digit || c == 'x' && hexdig
                x = l
                while (valid(s[l])) l++;

                if (l == x || c == 'x' && l - x > 8) return helper.syntaxError(
                    c == 'b' && 'expected "%b" 1*BIT [ 1*("." 1*BIT) / ("-" 1*BIT) ]' ||
                    c == 'd' && 'expected "%d" 1*DIGIT [ 1*("." 1*DIGIT) / ("-" 1*DIGIT) ]' ||
                    'expected "%x" 1*8HEXDIG [ 1*("." 1*8HEXDIG) / ("-" 1*8HEXDIG) ]',
                    s.slice(x).split(crlf, 1)[0], start)

                if (s[l] == '-') {
                    l++
                    x = l
                    while (valid(s[l])) l++;

                    if (l == x || c == 'x' && l - x > 8) helper.syntaxError(
                        c == 'b' && 'expected "%b" 1*BIT "-" 1*BIT' ||
                        c == 'd' && 'expected "%d" 1*DIGIT "-" 1*DIGIT' ||
                        'expected "%x" 1*8HEXDIG "-" 1*8HEXDIG',
                        s.slice(x).split(crlf, 1)[0], start)
                } else {
                    while (s[l] == '.') {
                        l++
                        x = l
                        while (valid(s[l])) l++;

                        if (l == x || c == 'x' && l - x > 8) helper.syntaxError(
                            c == 'b' && 'expected "%b" 1*BIT 1*("." 1*BIT)' ||
                            c == 'd' && 'expected "%d" 1*DIGIT 1*("." 1*DIGIT)' ||
                            'expected "%x" 1*8HEXDIG 1*("." 1*8HEXDIG)',
                            s.slice(x).split(crlf, 1)[0], start)
                    }
                }

                prob = collector.retrans(toTok(start, '', s.slice(i, i + 2)))
                if (prob) return prob
                i += 2
            }
        }


        if (i == l) return helper.syntaxError(
            'unexpected symbols', s.slice(i).split(crlf, 1)[0], start);

        prob = collector.retrans(toTok(start, form, s.slice(i, l)))
        if (prob) return prob
        i = l
    }

    if (defas == -1) return helper.syntaxError('unexpected empty rulelist', '<<EOF>>')

    if (right) {
        return helper.syntaxError(
            right[0] == '>' &&
            'unexpected incomplete matching angle brackets previous rule' ||
            'unexpected incomplete matching brackets previous rule', '<<EOF>>');
    }

    if (!defas || prev == '=')
        return helper.syntaxError(
            'unexpected incomplete previous rule', '<<EOF>>');

    if (')]>rnt'.indexOf(prev) == -1)
        return helper.syntaxError(
            'unexpected incremental alternatives', '<<EOF>>');

    return collector.retrans(null)
}

exports.Retrans = Retrans
exports.Trans = Trans
exports.Entries = Entries
exports.tokenize = tokenize
exports.Rules = require('./core-rules')
exports.Actions = require('./core-actions')
},{"./core-actions":3,"./core-rules":4,"./helper":6}],6:[function(require,module,exports){
"use strict"

function msg(message, text, loc) {
	if (!loc && !text) return message
	return message + ':' + (loc && (loc.line + ':' + loc.col) || '') +
		'\n' + JSON.stringify(text)
}

exports.syntaxError = function syntaxError(message, text, loc, fileName) {
	return new SyntaxError(msg(message, text, loc))
}

exports.retrans = function retrans(collector) {
	var instance = collector && (
		typeof collector.retrans == 'function' && collector ||
		typeof collector == 'function' && collector.prototype &&
		typeof collector.prototype.retrans == 'function' &&
		new collector()) || null

	if (!instance) throw new Error(
		'The object does not implement Retrans: ' + JSON.stringify(collector))
	return instance
}
},{}]},{},[1])(1)
});