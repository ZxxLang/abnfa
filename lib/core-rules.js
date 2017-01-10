"use strict"
var helper = require('./helper');
var bs = require('binarysearch');
var uiq = {
	unique: true
};
//var factory = {};

function create() {
	return Object.create(null)
		// factory[name] = factory[name] ||
		// 	Function('return function ' + name + '(){}')()

	// return new factory[name]
}

function Rules() {
	// .first the name of first Rule
	// .defs  {name: Rule,comments: comments }
	//
	// comments [comment]
	//
	// comment  {raw: String} not contain CRLF
	//
	// Rule {name: String, alts: alts }
	//
	// alts [ alts | serial | text | range | binary | ref ]
	//
	// serial {
	// 	 rep: repeat,
	//   seqs: [alts | text | range | binary | ref]
	// }
	//
	// repeat {
	//     min: Number,
	//     max: Number
	// }
	//
	// ref {
	//     rep: repeat,
	//     ref: String,
	// }
	//
	// text {
	//     rep: repeat,
	//     formal: "" | "s" | "i",
	//     raw: "non empty string"
	// }
	//
	// range {
	//    rep: repeat,
	//    formal: "b" | "d" | "x",
	//    first: String( 1*bit | 1*dec | 1*hex ),
	//    last: String( 1*bit | 1*dec | 1*hex )
	// }
	//
	// binary {
	//     rep: repeat,
	//     formal: "b" | "d" | "x",
	//     seqs: [ String( 1*bit | 1*dec | 1*hex ) ]
	// }
	//
	// bit  [01]
	// dec  [0-9]
	// hex  [0-9A-F]
	this.defs = create()
	this.refs = create()
	this.deps = create()
	this.literals = []
	this.comments = []
}

Rules.prototype.addRef = function(ref) {
	var name = ref.ref.split('-')[0],
		a = this.refs[name] = this.refs[name] || []

	a.indexOf(this._rulename) == -1 && a.push(this._rulename)

	a = this.deps[this._rulename] = this.deps[this._rulename] || []
	a.indexOf(name) == -1 && a.push(name)
	return ref
}

Rules.prototype.addLit = function(lit) {
	if (this.literals.indexOf(lit.raw) == -1)
		this.literals.push(lit.raw)
	return lit
}

Rules.prototype.analyze = function analyze() {
	var n = this.bare(),
		unrefs = [],
		undefs = [];

	for (var k in n.defs)
		if (k != n.first && !n.refs[k]) unrefs.push(k)

	var a = [],
		keys = Object.keys(n.refs);

	keys.forEach(function(k) {
		if (!n.defs[k]) undefs.push(k)
		n.refs[k].forEach(function(k) {
			bs.insert(a, k, uiq)
		})
	})

	n.terminals = keys.filter(function(k) {
		return a.indexOf(k) == -1
	});

	n.terminals = n.terminals.sort();
	while (true) {
		var find = 0
		for (var k in n.deps) {
			if (k != n.first && bs(n.terminals, k) == -1 &&
				n.deps[k].every(function(dep) {
					return bs(n.terminals, dep) != -1
				})) {
				find = 1
				bs.insert(n.terminals, k)
			}
		}
		if (!find) break
	}

	n.unrefs = unrefs.sort();
	n.undefs = undefs.sort();

	return n
}

Rules.prototype.bare = function bare() {
	// results an bare object with no prototype
	var n = create()
	n.first = this.first

	n.defs = create()
	for (var k in this.defs)
		n.defs[k] = this.defs[k].bare();


	n.comments = this.comments.map(function(c) {
		return c.bare()
	})

	n.refs = create()
	for (var k in this.refs)
		n.refs[k] = this.refs[k].slice(0).sort();

	n.deps = create()
	for (var k in this.deps)
		n.deps[k] = this.deps[k].slice(0).sort();

	n.literals = this.literals.slice(0).sort();
	return n
}

Rules.prototype.retrans = function retrans(toks) {
	var tok;
	// clear placeholder and delimitation tokens
	if (toks == null) return this

	toks = toks.filter(function(tok) {
		return ['wsp', 'crlf', '"', '<', '>', '%b', '%d', '%x', '%s', '%i']
			.indexOf(tok.form || tok.raw) == -1
	}, this)

	if (!toks.length) return

	if (toks[0].form == 'comment') {
		for (var i = 0; i < toks.length; i++)
			this.comments.push(new Comment(toks[i]));
		return
	}

	// tok = toks[0]
	// if (tok.form != 'rulename')
	// 	return helper.syntaxError('expected rulename',
	// 		tok.form || tok.raw, tok.start)

	var rule = new Rule(toks[0].raw)

	toks = toks.filter(function(tok) {
		if (tok.form == 'comment') {
			if (!this.comments) this.comments = []
			this.comments.push(new Comment(tok));
			return false
		}
		return true
	}, rule)

	// if (toks.length < 3)
	// 	return helper.syntaxError(
	// 		'unexpected empty rule', rule.name, rule.start)

	tok = toks[1]
		// if (tok.form != '=') {
		// 	return helper.syntaxError('expected rulename',
		// 		tok.form || tok.raw, tok.start)
		// }

	if (tok.raw == '=') {
		if (this.defs[rule.name])
			return helper.syntaxError(
				'unexpected duplicates rule', rule.name, rule.start)
		this.defs[rule.name] = rule
	} else if (!this.defs[rule.name])
		return helper.syntaxError(
			'unexpected incremental rule', rule.name, rule.start)
	else
		rule = this.defs[rule.name]

	this._rulename = rule.name
	this.first = this.first || rule.name

	var alts = new Choice();
	toks = reduce(this, alts, toks.slice(2), '')

	if (this.error) return this.error

	if (toks.length) return helper.syntaxError(
		'unexpected token', toks[0].raw, toks[0].start)

	rule.alts = rule.alts.concat(alts.alts)
}


function reduce(r, alts, toks, close) {
	// alternatives
	var l, rep, first, form, alt;
	var seqs = new Serial();

	while (toks.length) {

		l = toks.length
		first = toks[0]
		form = first.form || first.raw

		if (close && form == close[0]) {
			toks = toks.slice(1)
			break
		}

		if (form == '/') {
			// if (!seqs.seqs.length || toks.length == 1) {
			// 	this.error = helper.syntaxError(
			// 		'unexpected incremental alternatives', '', first.start)
			// 	return toks
			// }
			alts.push(seqs)
			toks = toks.slice(1)
			continue
		}

		if (form == 'repeat') {
			rep = repeat(first)
			l--
			toks = toks.slice(1)
			first = toks[0]
			form = first.form || first.raw
		}

		switch (form) {
			case 'rulename':
				seqs.push(r.addRef(new Ref(first, rep)))
				toks = toks.slice(1)
				break
			case 'string':
				seqs.push(r.addLit(new Text(first, rep, '')))
				toks = toks.slice(1)
				break
			case '[':
				l--
				alt = new Choice(new Repeat(first, 0, 1))
				toks = reduce(r, alt, toks.slice(1), ']' + close);
				if (alt.alts.length) seqs.push(alt)
				break
			case '(':
				l--
				alt = new Choice(rep)
				toks = reduce(r, alt, toks.slice(1), ')' + close);
				if (alt.alts.length) seqs.push(alt)
				break
			case 'b':
			case 'd':
			case 'x':
				seqs.push(num(first, rep, form))
				toks = toks.slice(1)
				break
			case 'i':
			case 's':
				seqs.push(r.addLit(new Text(first, rep, form)))
				toks = toks.slice(1)
				break
		}
		rep = null

		if (r.error || l == toks.length) break
	}

	if (!r.error && seqs.seqs.length) alts.push(seqs)
	return toks
}

function repeat(tok) {
	var mm = ('0' + tok.raw).split('*');
	mm.push(mm[0])
	var rep = new Repeat(tok, Number(mm[0]), Number(mm[1]))
	if (rep.min == 1 && rep.min == rep.max) return null
	return rep
}

function Rule(raw) {
	this.name = raw
	this.alts = []
}

Rule.prototype.bare = function bare() {
	var n = create();
	n.name = this.name
	n.alts = this.alts.map(function(a) {
		return a.bare()
	})
	return n
}

function Repeat(tok, min, max) {
	this.min = min == null && 1 || min
	this.max = max == null && 1 || max || -1
}

Repeat.prototype.bare = function bare() {
	var n = create()
	n.min = this.min
	n.max = this.max
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

function Ref(tok, rep) {
	if (rep) this.rep = rep
	this.ref = tok.raw
}

Ref.prototype.bare = function bare() {
	var n = create()
	if (this.rep) n.rep = this.rep.bare()
	n.ref = this.ref
	return n
}

function Text(tok, rep, formal) {
	if (rep) this.rep = rep
	this.formal = formal
	this.raw = tok.raw
}

Text.prototype.bare = function bare() {
	var n = create()
	if (this.rep) n.rep = this.rep.bare()
	n.formal = this.formal
	n.raw = this.raw
	return n

}

function num(tok, rep, formal) {
	if (tok.raw.indexOf('-') != -1)
		return new Range(tok, rep, formal)

	return new Binary(tok, rep, formal)
}

function Binary(tok, rep, formal) {
	if (rep) this.rep = rep
	this.formal = formal
	this.seqs = tok.raw.split('.')
}

Binary.prototype.bare = function bare() {
	var n = create()
	if (this.rep) n.rep = this.rep.bare()
	n.formal = this.formal
	n.seqs = this.seqs.slice(0)
	return n
}

function Range(tok, rep, formal) {
	if (rep) this.rep = rep
	var mm = tok.raw.split('-');
	this.formal = formal
	this.first = mm[0]
	this.last = mm[1]
}

Range.prototype.bare = function bare() {
	var n = create()
	if (this.rep) n.rep = this.rep.bare()
	n.formal = this.formal
	n.first = this.first
	n.last = this.last
	return n
}

function Choice(rep) {
	if (rep) this.rep = rep
	this.alts = []
}

Choice.prototype.bare = function bare() {
	var n = create()
	if (this.rep) n.rep = this.rep.bare()
	n.alts = this.alts.map(function(o) {
		return o.bare()
	})
	return n
}

Choice.prototype.push = function(n) {
	// n instanceof Serial
	if (n.seqs.length == 1 && !n.rep) {
		var m = n.seqs[0];
		if (m instanceof Choice && !m.rep) {
			this.alts = this.alts.concat(m.alts)
		} else
			this.alts.push(m)

		n.seqs = []
		return
	}

	var m = new Serial(n.rep)
	m.seqs = n.seqs
	n.seqs = []
	this.alts.push(m)
	return
}

function Serial(rep) {
	if (rep) this.rep = rep
	this.seqs = []
}

Serial.prototype.bare = function() {
	var n = create()
	if (this.rep) n.rep = this.rep.bare()
	n.seqs = this.seqs.map(function(o) {
		return o.bare()
	})
	return n
}

Serial.prototype.push = function(n) {
	if (n instanceof Choice) {
		var m = n.alts[0]
		if (n.alts.length == 1 && !n.rep) {
			if (m instanceof Serial && !m.rep) {
				this.seqs = this.seqs.concat(m.seqs)
			} else
				this.seqs.push(m)

			n.alts = []
			return
		}

		m = new Choice(n.rep)
		m.alts = n.alts
		n.alts = []
		this.seqs.push(m)
		return
	}

	this.seqs.push(n)
}

module.exports = Rules