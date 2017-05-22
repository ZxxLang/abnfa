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