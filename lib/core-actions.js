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

function setLocation(list, eols, x) {
	var n,
		i = 0;
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

function Actions(rules) {
	this.retrans(rules)
}

Actions.prototype.parse = function parse(inputSource, rulename) {
	this.rulename = rulename || this.rulename || ''
	this.src = inputSource
	if (!this.defs) {
		this.err = 'missing rules'
		return new Error(this.err)
	}
	return this.retrans(null)
}

Actions.prototype.retrans = function retrans(rules) {
	if (rules != null) {
		this.err = ''
		this.rulename = rules.first
		this.defs = rules.defs
		this.tokenize = rules.tokenize

		for (var k in rules.plugins) {
			this[k](rules.plugins[k])
			if (this.err)
				return new Error(this.err)
		}
		this.loaded = true
	}
	if (this.err) return new Error(this.err)

	if (!this.src || !this.defs) return

	this.lexing = false;
	this.building = false;
	this.infixes = Object.create(null)

	this.err = '';
	this.crlf = ''
	this.eols = [];
	this.indent = null;
	this.indents = []

	// source offset
	this.sPos = 0;
	this.sLen = this.src.length;

	// tokens offset
	this.tokens = [];
	this.tPos = 0;
	this.tLen = 0;

	// actions offset
	this.actions = [];
	this.aPos = 0;

	let n = this.defs[this.rulename]
	if (!n) {
		this.err = `undefined rule ${this.rulename}`
		return new Error(this.err)
	}

	this.repeat(n)

	if (!this.err && this.sPos != this.sLen)
		this.err = `Not fully matched ${this.sPos}/${this.sLen}`

	if (this.err) return new Error(this.err)

	return this.tokens
}

Actions.prototype.token = function() {
	if (this.tPos == this.tLen) {
		if (this.sPos == this.sLen) return null
		this.lexing = true
		if (!this.repeat(this.tokenize)) {
			this.lexing = false
			return null
		}
		this.lexing = false
	}

	return !this.err && this.tPos < this.tLen &&
		this.tokens[this.tPos] || null
}

Actions.prototype.postToken = function(token, start) {
	let tok = [token, start, this.sPos - start];
	if (this.tLen == this.tokens.length)
		this.tokens.push(tok)
	else
		this.tokens[this.tLen] = tok
	this.tLen++
}

Actions.prototype.postAction = function(start, n) {
	let action = [start, this.tPos, n];
	if (this.aPos == this.actions.length)
		this.actions.push(action)
	else
		this.actions[this.aPos] = action
	this.aPos++
}

Actions.prototype.repeat = function(n) {
	let i = 0,
		name = n.kind == 'P' && n.ref || n.kind,
		sPos = this.sPos,
		tPos = this.tPos,
		tLen = this.tLen,
		aPos = this.aPos;

	while (!this.err && i != n.max && this[name](n)) {
		i++;
	}

	if (!this.err && i >= n.min) return 1

	if (this.lexing) {
		this.sPos = sPos
		this.tLen = tLen
	} else {
		this.tPos = tPos
		this.aPos = aPos
	}
	return 0
}

Actions.prototype.r = function ref(n) {
	if (!n.token)
		return this.repeat(this.defs[n.ref])

	if (this.lexing) {
		let start = this.sPos;
		if (!this.repeat(this.defs[n.ref]))
			return 0
		this.postToken(n.token, start)
		return 1
	}
	let tok = this.token();
	if (!tok || tok[0] != n.token) return 0
	this.tPos++
	return 1

}

Actions.prototype.a = function action(n) {
	let pos = this.tPos;
	if (!n.token) {
		if (!this.repeat(this.defs[n.ref]))
			return 0
		this.postAction(pos, n)
		return 1
	}

	let tok = this.token();
	if (!tok || tok[0] != n.token) return 0
	this.tPos++
	this.postAction(pos, n)
	return 1
}

Actions.prototype.i = function insensitive(n) {
	// case-insensitive lexer
	let x;
	if (this.lexing) {
		x = this.src.substr(this.sPos, n.raw.length)
		if (x != n.raw && x.toLowerCase() != n.raw)
			return 0
		if (n.token) {
			let start = this.sPos;
			this.sPos += x.length
			this.postToken(n.token, start)
		} else
			this.sPos += x.length
		return 1
	}

	let tok = this.token()
	if (!tok || !n.token && n.raw.length != tok[2]) return 0
	if (n.token && n.token == tok[0]) {
		this.tPos++
		return 1
	}

	x = this.src.substr(tok[1], tok[2])
	if (x != n.raw && x.toLowerCase() != n.raw)
		return 0
	this.tPos++
	return 1
}

Actions.prototype.s = function sensitive(n) {
	// case-sensitive match
	let x;
	if (this.lexing) {
		x = this.src.substr(this.sPos, n.raw.length)
		if (x != n.raw) return 0
		if (n.token) {
			let start = this.sPos;
			this.sPos += x.length
			this.postToken(n.token, start)
		} else
			this.sPos += x.length
		return 1
	}

	let tok = this.token()
	if (!tok || !n.token && n.raw.length != tok[2]) return 0
	if (n.token && n.token == tok[0]) {
		this.tPos++
		return 1
	}
	x = this.src.substr(tok[1], tok[2])
	if (x != n.raw) return 0
	this.tPos++
	return 1
}

Actions.prototype.B = function BinaryCharCode(n) {
	// BinaryCharCode match
	if (this.lexing) {
		if (this.src.charCodeAt(this.sPos) != n.value) return 0
		if (n.token) {
			let start = this.sPos;
			this.sPos++
			this.postToken(n.token, start)
		} else
			this.sPos++
		return 1
	}

	let tok = this.token()
	if (!tok || n.token && n.token != tok[0] || tok[2] != 1)
		return 0
	if (this.src.charCodeAt(tok[1]) != n.value) return 0
	this.tPos++
	return 1
}

Actions.prototype.R = function BinaryRange(n) {
	// BinaryRange match
	let x;
	if (this.lexing) {
		x = this.src.charCodeAt(this.sPos)
		if (x < n.first || x > n.last) return 0
		if (n.token) {
			let start = this.sPos;
			this.sPos++
			this.postToken(n.token, start)
		} else
			this.sPos++
		return 1
	}

	let tok = this.token()
	if (!tok || n.token && n.token != tok[0] ||
		tok[2] != 1) return 0

	x = this.src.charCodeAt(tok[1])
	if (x < n.first || x > n.last) return 0
	this.tPos++
	return 1
}

Actions.prototype.S = function BinarySequence(n) {
	// BinarySequence match
	let pos = 0,
		start = this.sPos,
		len = this.sLen;
	if (this.lexing) {
		pos = this.sPos
		if (pos + n.seqs.length > len)
			return 0
	} else {
		let tok = this.token()
		if (!tok || n.token && n.token != tok[0] ||
			tok[2] != n.seqs.length) return 0
		if (n.token && n.token == tok[0]) {
			this.tPos++
			return 1
		}
		len = tok[2]
	}

	for (let v of n.seqs)
		if (pos == len || v != this.src.charCodeAt(pos++))
			return 0

	if (this.lexing) {
		this.sPos += n.seqs.length
		if (n.token)
			this.postToken(n.token, start)
	} else
		this.tPos++
	return 1
}

Actions.prototype.A = function Alternatives(n) {
	// Alternatives match source or token
	for (let x of n.seqs)
		if (this.repeat(x)) return 1
	return 0
}

Actions.prototype.C = function Concatenation(n) {
	// Concatenation match source or token
	let sPos = this.sPos,
		tPos = this.tPos,
		tLen = this.tLen,
		aPos = this.aPos;

	for (let x of n.seqs) {
		if (this.repeat(x)) continue

		if (this.lexing) {
			this.sPos = sPos
			this.tLen = tLen
		} else {
			this.tPos = tPos
			this.aPos = aPos
		}
		return 0
	}
	return 1
}

// plugins

Actions.prototype.NLlexer = function NLlexer(n) {
	let pos = this.sPos;
	if (this.crlf) {
		if (this.crlf !=
			this.src.substr(pos, this.crlf.length))
			return 0
	} else {
		this.crlf = this.src[pos] == '\r' &&
			(this.src[pos + 1] == '\n' && '\r\n' || '\r') ||
			this.src[pos] == '\n' && '\n' || ''
		if (!this.crlf) return 0
	}

	this.sPos += this.crlf.length
	if (!this.NLindent()) {
		this.sPos = pos
		return 0
	}

	this.postToken(n.token, pos)

	if (!this.eols.length ||
		this.eols[this.eols.length - 1] < this.sPos)
		this.eols.push(this.sPos)

	return 1
}

Actions.prototype.NLindent = function NLindent() {
	// match indent after CRLF
	if (!this.indents.length) return 1
	let i = this.indents.length - 1,
		s = this.indents[i];

	if (s) {
		if (s != this.src.substr(this.sPos, s.length))
			return 0
		this.sPos += s.length
		return 1
	}

	if (i) {
		s = this.indents[i - 1]
		if (s != this.src.substr(this.sPos, s.length))
			return 0
		this.sPos += s.length
	}

	let pos = this.sPos
	if (!this.repeat(this.indent) || pos == this.sPos)
		return 0
	this.indents[i] = this.src.substring(pos, this.sPos)
	return 1
}

Actions.prototype.NLinit = function NLinit(n) {
	if (!n.method) return 1

	let indent = n.method.slice(1)

	if (!this.defs[indent] || this.defs[indent].token) {
		this.err = `undefined indent rule ${indent} or token not equal 0`
		return 0
	}

	this.indent = this.defs[indent]
	this.INDENT = this.indent.kind == 's' &&
		this.indent.raw || ''

	return 1
}

Actions.prototype.NL = function NL(n) {
	if (this.lexing) return this.NLlexer(n)
	if (!this.loaded) return this.NLinit(n)

	if (!n.method) {
		// match token
		let tok = this.token()
		if (!tok || tok[0] != n.token)
			return 0
		this.tPos++
		return 1
	}

	if (!this.indent) {
		this.err = 'missing NL-IndentRule in PLUGINS'
		return 0
	}

	if (n.method == '--') {
		// opening
		this.indents.push(
			(this.indents.length && this.indents[this.indents.length - 1] || '')
			+ this.INDENT
		)
	} else if (n.method == '-') {
		// closing
		if (!this.indents.length) {
			this.err = 'NL-- and NL- must be paired'
			return 0
		}
		this.indents.pop()
	} else {
		this.err = `illegal NL${n.method}`
		return 0
	}

	return 1
}

Actions.prototype.FAIL = function FAIL(n) {
	if (!this.loaded) return 1
	this.err = n.method.slice(1)
	return 0
}

Actions.prototype.STAGE = function STAGE(n) {
	let methods = n.method.split('-')
	if (!this.loaded) {
		this.stage = methods[1]
		return 1
	}
	if (methods[1] == 'to') {
		this.stage = methods[2] || ''
		return 1
	}
	if (methods[1] == 'is')
		return methods.slice(2).indexOf(this.stage) != -1
	if (methods[1] == 'un')
		return methods.slice(2).indexOf(this.stage) == -1
	this.err = `illegal STAGE${n.method}`
	return 0
}

Actions.prototype.SET = function SET(n) {
	if (!this.loaded) return 1

	if (this.lexing) {
		this.err = `unsupported SET${n.method} in lexing`
		return 0
	}
	if (!this.buiding) {
		this.postAction(-1, n)
		return 1
	}
	return 1
}

Actions.prototype.TOINT = function TOINT(n) {
	if (!this.loaded) return 1

	if (this.lexing) {
		this.err = `unsupported TOINT${n.method} in lexing`
		return 0
	}

	if (!this.buiding) {
		this.postAction(-1, n)
		return 1
	}
	return 1
}

