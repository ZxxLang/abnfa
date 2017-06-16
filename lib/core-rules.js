'use strict'
var helper = require('./helper');

function create() {
	return Object.create(null);
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
	//     formal: ""   ; non-explicit
	//     		| "s"   ; case-sensitive
	//     		| "i",  ; case-insensitive
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

	this.defs = create();
	this.deps = create();
	this.literals = [];
	this.comments = [];
	this.plugins = []; // ACTIONS plugins
}

Rules.prototype.addAction = function(ref) {
	if (ref.ref == 'ACTIONS') {
		if (this.plugins.indexOf(ref.method || '-') == -1)
			this.plugins.push(ref.method)

		if (ref.method == 'OUTDENT' && this.plugins.indexOf('CRLF') == -1)
			this.plugins.push('CRLF')

		return ref
	}

	if (this.plugins.indexOf(ref.ref) == -1) {
		addDeps(this, ref.ref)
		return ref
	}

	switch (ref.ref) {
		case 'DENY':
		case 'NON':
			addDeps(this, ref.method, ref.key, ref.type)
			break
	}

	return ref;
};

function addDeps(r) {
	var a = r.deps[r.current] = r.deps[r.current] || [];
	for (var i = 1; i < arguments.length; i++) {
		if (!arguments[i]) break
		a.indexOf(arguments[i]) == -1 && a.push(arguments[i]);
	}
}

Rules.prototype.addLit = function(lit) {
	if (this.literals.indexOf(lit.raw) == -1)
		this.literals.push(lit.raw);
	return lit;
};

Rules.prototype.bare = function bare() {
	// Results an bare object with no prototype
	var k,
		n = create();

	n.first = this.first;
	n.defs = create();
	n.deps = create();
	n.undefs = [];
	n.unrefs = Object.keys(this.defs);
	n.unrefs[0] = '';
	n.unrefs = n.unrefs.sort();

	for (k in this.defs) {
		n.defs[k] = this.defs[k].bare();
	}

	for (k in this.deps) {
		n.deps[k] = this.deps[k].slice();
		n.deps[k].sort()
		n.deps[k].forEach(function(k, i) {
			!this.defs[k] && this.undefs.indexOf(k) == -1 &&
			this.undefs.push(k);

			i = this.unrefs.indexOf(k);
			if (i != -1)
				this.unrefs[i] = '';
		}, n);
	}

	n.unrefs = n.unrefs.filter(function(k) {
		return k != '';
	});

	n.literals = this.literals.slice();

	return n;
};

Rules.prototype.retrans = function retrans(toks) {
	var i = 0,
		tok,
		rule,
		alts;
	// Clear placeholder and delimitation tokens
	if (toks == null) {
		this.current = null;
		this.literals.sort();
		return this.bare();
	}

	// find rulename and defined-as
	while (i < toks.length) {
		switch (toks[i].form) {
			case ';':
				this.comments.push(new Comment(toks[i]));
				break
			case '=':
				tok = toks[i]
				break
			case 'R':
				if (tok || rule) return helper.syntaxError(
						'unexpected rulename', toks[i].raw, toks[i].start);
				rule = new Rule(toks[i].raw);
				break
			case 'W':
			case 'C':
				break
			default:
				return helper.syntaxError(
					'unexpected token', toks[i].raw, toks[i].start);
		}
		i++
		if (tok) break
	}

	if (!tok && !rule) return

	if (!(tok && rule)) return helper.syntaxError(
			'expected rulename and defined-as', toks[0].raw, toks[0].start);

	if (tok.raw == '=') {
		if (this.defs[rule.name])
			return helper.syntaxError(
				'unexpected duplicates rule', rule.name, rule.start);

	} else if (tok.raw != '=/') {
		return helper.syntaxError(
			'unexpected defined-as value', tok.raw, tok.start);

	} else if (!this.defs[rule.name])
		return helper.syntaxError(
			'unexpected incremental rule', rule.name, rule.start);

	alts = new Choice(1, 1);
	this.current = rule.name;
	this.first = this.first || rule.name;

	this.i = i
	reduce(this, alts, toks, '');
	i = this.i

	if (i != toks.length) return helper.syntaxError(
			'unexpected invalid token', toks[i].raw, toks[i].start);

	if (this.defs[rule.name]) {
		this.defs[rule.name].alts = this.defs[rule.name].alts.concat(alts.alts);
	} else {
		rule.alts = alts.alts;
		this.defs[rule.name] = rule;
	}
};

function reduce(r, alts, toks, close) {
	// Alternatives
	var min,
		max,
		tok,
		alt,
		seqs = new Serial(1, 1);

	while (r.i < toks.length) {

		tok = toks[r.i++];

		if (!tok.form || tok.form == 'W' || tok.form == 'C') continue

		if (close && tok.form == close) break;

		if (tok.form == '*') { // Repeat
			if (tok.raw == '*') {
				min = 0;
				max = -1;
			} else {
				min = tok.raw.indexOf('*') + 1;
				if (!min) {
					min = parseInt(tok.raw);
					max = min;
				} else {
					max = parseInt(tok.raw.substring(min)) || -1;
					min = min != 1 && parseInt(tok.raw) || 0;
				}
			}

			if (r.i == toks.length) return r.i--

			tok = toks[r.i++];
		} else {
			min = 1;
			max = 1;
		}

		switch (tok.form) {
			case 'R':
				seqs.push(r.addAction(new Action(tok, min, max)));
				break;
			case '/':
				alts.push(seqs);
				break
			case '[':
				alt = new Choice(0, 1);
				reduce(r, alt, toks, ']');
				if (alt.alts.length) seqs.push(alt);
				break;
			case '(':
				alt = new Choice(min, max);
				reduce(r, alt, toks, ')');
				if (alt.alts.length) seqs.push(alt);
				break;
			case '<':
				alt = new Choice(min, max);
				reduce(r, alt, toks, '>');
				if (alt.alts.length) seqs.push(alt);
				break;
			case 'b':
			case 'd':
			case 'x':
				seqs.push(num(tok, min, max, tok.form));
				break;

			case 'Q': // quote string
				seqs.push(r.addLit(new Text(tok, min, max, '')));
				break;
			case 'i': // case-insensitive string
			case 's': // case-sensitive string
				seqs.push(r.addLit(new Text(tok, min, max, tok.form)));
				break;
		}

	}
	if (seqs.seqs.length) alts.push(seqs);
}

function Rule(raw) {
	this.min = 1;
	this.max = 1;
	this.alts = [];
	this.name = raw;
}

Rule.prototype.bare = function bare() {
	var n = Choice.prototype.bare.call(this);
	n.name = this.name;
	return n;
}

function Comment(tok) {
	this.raw = tok.raw;
}

Comment.prototype.bare = function bare() {
	var n = create();
	n.raw = this.raw;
	return n;
}

function Action(tok, min, max) {
	var actions = tok.raw.split('-');
	this.min = min;
	this.max = max;
	this.ref = actions.shift();
	if (!actions.length) return;
	this.tail = tok.raw.slice(this.ref.length);

	// Ref-method-key-type
	// ref-to-key- ---> ref-to-key-ref
	if (actions.length && !actions[actions.length - 1]) {
		this.type = this.ref;
		actions.pop();
		if (actions.length)
			this.method = actions.shift();
		if (actions.length)
			this.key = actions.shift();
	} else {
		if (actions.length)
			this.method = actions.shift();
		if (actions.length)
			this.key = actions.shift();
		if (actions.length)
			this.type = actions.shift();
	}

	if (this.key == 'to')
		this.key = '';
}

Action.prototype.bare = function bare() {
	var n = create();
	n.min = this.min;
	n.max = this.max;
	n.ref = this.ref;
	if (this.tail) {
		n.tail = this.tail;
		if (this.type)
			n.type = this.type;
		if (this.method)
			n.method = this.method;
		if (this.key)
			n.key = this.key;
	}
	return n;
};
function Text(tok, min, max, formal) {
	this.min = min;
	this.max = max;
	if (formal)
		this.formal = formal;
	this.raw = tok.raw;
}

Text.prototype.bare = function bare() {
	var n = create();
	n.min = this.min;
	n.max = this.max;
	if (this.formal)
		n.formal = this.formal;
	n.raw = this.raw;
	return n;
};
function num(tok, min, max, formal) {
	var radix = formal == 'b' && 2 || formal == 'd' && 10 || 16;
	if (tok.raw.indexOf('-') != -1)
		return new Range(tok, min, max, radix);

	return new Binary(tok, min, max, radix);
}
function Binary(tok, min, max, radix) {
	this.min = min;
	this.max = max;
	this.radix = radix;
	this.fields = tok.raw.split('.').map(function(s) {
		return parseInt(s, radix);
	});
}

Binary.prototype.bare = function bare() {
	var n = create();
	n.min = this.min;
	n.max = this.max;
	n.radix = this.radix;
	n.fields = this.fields.slice(0);
	return n;
};
function Range(tok, min, max, radix) {
	var mm = tok.raw.split('-');
	this.min = min;
	this.max = max;
	this.radix = radix;
	this.first = parseInt(mm[0], radix);
	this.last = parseInt(mm[1], radix);
}

Range.prototype.bare = function bare() {
	var n = create();
	n.min = this.min;
	n.max = this.max;
	n.radix = this.radix;
	n.first = this.first;
	n.last = this.last;
	return n;
};
function Choice(min, max) {
	this.min = min;
	this.max = max;
	this.alts = [];
}

Choice.prototype.bare = function bare() {
	var n;
	if (this.alts.length == 1) {
		if (this.min == 1 && this.max == 1) return this.alts[0].bare();

		if (this.alts[0].min == 1 && this.alts[0].max == 1) {
			n = this.alts[0].bare();
			n.min = this.min;
			n.max = this.max;
			return n;
		}
	}

	n = create();
	n.min = this.min;
	n.max = this.max;
	n.alts = this.alts.map(function(o) {
		return o.bare();
	});
	return n;
};

Choice.prototype.push = function(n) {
	// N instanceof Serial
	if (n.seqs.length == 1 && n.min == 1 && n.max == 1) {
		var m = n.seqs[0]; // Support precedences
		if (m instanceof Choice && m.min == 1 && m.max == 1 && !m.alts[0].raw) {
			this.alts = this.alts.concat(m.alts);
		} else
			this.alts.push(m);

		n.seqs = [];
		return;
	}
	var m = new Serial(n.min, n.max);
	m.seqs = n.seqs;
	n.seqs = [];
	this.alts.push(m);
	return;
};
function Serial(min, max) {
	this.min = min;
	this.max = max;
	this.seqs = [];
}

Serial.prototype.bare = function bare() {
	var n;
	if (this.seqs.length == 1) {
		if (this.min == 1 && this.max == 1) return this.seqs[0].bare();

		if (this.seqs[0].min == 1 && this.seqs[0].max == 1) {
			n = this.seqs[0].bare();
			n.min = this.min;
			n.max = this.max;
			return n;
		}
	}

	n = create();
	n.min = this.min;
	n.max = this.max;
	n.seqs = this.seqs.map(function(o) {
		return o.bare();
	});

	return n;
};

Serial.prototype.push = function(n) {

	if (n instanceof Choice) {
		var m = n.alts[0];
		if (n.alts.length == 1 && n.min == 1 && n.max == 1) {
			if (m instanceof Serial && m.min == 1 && m.max == 1) {
				this.seqs = this.seqs.concat(m.seqs);
			} else
				this.seqs.push(m);

			n.alts = [];
			return;
		}

		m = new Choice(n.min, n.max);
		m.alts = n.alts;
		n.alts = [];
		this.seqs.push(m);
		return;
	}

	this.seqs.push(n);
};

Rules.Rule = Rule;
Rules.Comment = Comment;
Rules.Action = Action;
Rules.Text = Text;
Rules.Binary = Binary;
Rules.Range = Range;
Rules.Choice = Choice;
Rules.Serial = Serial;

module.exports = Rules;
