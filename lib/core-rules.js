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
	//     alts: [ serial | ref | text | range | binary | choice]
	// }
	//
	// Choice {
	//     rep: repeat,
	//     alts: [ serial | ref | text | range | binary ]
	// }
	//
	// Serial {
	// 	   rep: repeat,
	//     seqs: [ serial | ref | text | range | binary | choice ]
	// }
	//
	// Repeat { min: Number, max: Number }
	//
	// Action {
	//     rep: repeat,
	//     ref: String,
	//     tail: String,
	//     type: String,
	//     method: String,
	//     key: String,
	//     extra: String
	// }
	//
	// Text {
	//     rep: repeat,
	//     formal: "" | "s" | "i",
	//     raw: String
	// }
	//
	// Range {
	//    rep: repeat,
	//    radix: 2 | 10 | 16,
	//    first: Int( 1*BIT | 1*DEC | 1*HEX ),
	//    last: Int( 1*BIT | 1*DEC | 1*HEX )
	// }
	//
	// Binary {
	//     rep: repeat,
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
		return ['wsp', 'crlf', '"', '%b', '%d', '%x', '%s', '%i']
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

	this.current = rule.name
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
				seqs.push(r.addAction(new Action(first, rep)))
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
			case '<':
				l--
				alt = new Choice(rep)
				toks = reduce(r, alt, toks.slice(1), '>' + close);
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

function Action(tok, rep) {
	var actions = tok.raw.split('-');
	if (rep) this.rep = rep
	this.ref = actions.shift()
	if (!actions.length) return
	this.tail = tok.raw.slice(this.ref.length);

	// ref-method-key-type-extra
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
	if (actions.length) this.extra = actions.join('-')
}

Action.prototype.bare = function bare() {
	var n = create();
	if (this.rep) n.rep = this.rep.bare()
	n.ref = this.ref
	if (this.tail) {
		n.tail = this.tail
		if (this.type) n.type = this.type
		if (this.method) n.method = this.method
		if (this.key) n.key = this.key
		if (this.extra) n.extra = this.extra
	}
	return n
}

function Text(tok, rep, formal) {
	if (rep) this.rep = rep
	if (formal) this.formal = formal
	this.raw = tok.raw
}

Text.prototype.bare = function bare() {
	var n = create()
	if (this.rep) n.rep = this.rep.bare()
	if (this.formal) n.formal = this.formal
	n.raw = this.raw
	return n
}

function num(tok, rep, formal) {
	var radix = formal == 'b' && 2 || formal == 'd' && 10 || 16
	if (tok.raw.indexOf('-') != -1)
		return new Range(tok, rep, radix)

	return new Binary(tok, rep, radix)
}

function Binary(tok, rep, radix) {
	if (rep) this.rep = rep
	this.radix = radix
	this.fields = tok.raw.split('.').map(function(s) {
		return parseInt(s, radix)
	})
}

Binary.prototype.bare = function bare() {
	var n = create()
	if (this.rep) n.rep = this.rep.bare()
	n.radix = this.radix
	n.fields = this.fields.slice(0)
	return n
}

function Range(tok, rep, radix) {
	if (rep) this.rep = rep
	var mm = tok.raw.split('-');
	this.radix = radix
	this.first = parseInt(mm[0], radix)
	this.last = parseInt(mm[1], radix)
}

Range.prototype.bare = function bare() {
	var n = create()
	if (this.rep) n.rep = this.rep.bare()
	n.radix = this.radix
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
		var m = n.seqs[0]; // support precedences
		if (m instanceof Choice && !m.rep && !m.alts[0].raw) {
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

Rules.Rule = Rule
Rules.Repeat = Repeat
Rules.Comment = Comment
Rules.Action = Action
Rules.Text = Text
Rules.Binary = Binary
Rules.Range = Range
Rules.Choice = Choice
Rules.Serial = Serial

module.exports = Rules