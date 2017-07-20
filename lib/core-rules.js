'use strict'

function create() {
	return Object.create(null);
}

function syntaxError(msg, text, start) {
	text = JSON.stringify(text)
	return new SyntaxError(`${msg}:${start}:${text}`)
}

function Rules() {
	// Rules receive the entire of tokens of a rule by
	//  the retrans method to build a rule and results bare-Object by .bare().
	//
	// .first 	the name of first Rule
	// .defs  	key value pairs object {rule-name: Choice|Serial}
	// .comments [comment] the comment does not contain a CRLF
	//
	// The following attributes are used for analysis.
	//
	// .deps
	// .dict [string...]
	//
	// Prototypes
	//
	// Comment  { raw: String }
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
	//     method: String,
	//     type: String,
	//     key: String,
	// }
	//
	// Text {
	//     min: Number,
	//     max: Number,
	//     raw: String,
	//     lowerCase: Boolean
	//     		true  case-insensitive and string toLowerCase
	//     		false case-sensitive
	// }
	//
	// Binary {
	//     min: Int,
	//     max: Int,
	//     radix: 2 | 10 | 16,
	//     isRange: Boolean,
	//     fields: null | [ Int( 1*BIT | 1*DEC | 1*HEX ) ]
	// }
	//
	// BIT  "0" | "1"
	// DEC  "0"-"9"
	// HEX  "0"-"9" | "A" - "F" | "a" - "f"
	//

	this.defs = create();
	this.deps = create();
	this.plugins = create();
	this.comments = [];
}

function setPlug(r, toks, i) {
	var tok,
		j,
		name;
	while (i < toks.length) {
		tok = toks[i++]
		if (tok.formal == ';') {
			r.comments.push(new Comment(tok));
			continue
		}

		if (!tok.formal || tok.formal == 'w' || tok.formal == 'c')
			continue

		if (tok.formal != 'r') return syntaxError(
				'expected rulename', tok.raw, tok.start);

		j = tok.raw.indexOf('-')
		name = j == -1 && tok.raw || tok.raw.slice(0, j)
		r.plugins[name] = tok.raw.slice(name.length)
	}
}

function addRef(r, n) {
	let dep = r.deps[r.current] = r.deps[r.current] || { },
		name = 'r' + n.ref,
		deps = dep[name] = dep[name] || [];

	if (n.action && deps.indexOf(n.action) == -1)
		deps.push(n.action)
	return n
}

function addTerm(r, tok, n) {
	let dep = r.deps[r.current] = r.deps[r.current] || { },
		name = n.kind + (n.kind == 'i' && n.raw || tok.raw);

	dep[name] = []
	return n
}

Rules.prototype.bare = function bare() {
	// Results an bare object with no prototype
	var n = create(),
		deps = this.deps,
		defs = this.defs,
		tokens = [''],
		refs = [],
		plugins = this.plugins,
		TOKENIZE = defs.TOKENIZE && deps['TOKENIZE'] || null;

	if (!TOKENIZE)
		return new SyntaxError(`undefined TOKENIZE`)

	n.first = this.first;
	n.defs = create();
	n.plugins = create();

	for (let k in plugins) {
		if (k == 'TOKENIZE') return new SyntaxError(
				`illegal plugin ${k}`)
		if (defs[k]) return new SyntaxError(
				`duplicate plugin  rule ${k}`)

		tokens.push('r' + k)
		n.plugins[k] = create()
		n.plugins[k].method = plugins[k]
	}

	for (let k in TOKENIZE) {
		if (k == 'rTOKENIZE') return new SyntaxError(
				'illegal references TOKENIZE')

		if (k[0] != 'r') {
			tokens.push(k)
			continue
		}

		let s = k.slice(1)

		if (plugins[s] != null) {
			tokens.push(k)
			continue
		}

		if (!defs[s] || TOKENIZE[k].length) {
			k = s
		} else {
			tokens.push(k)
			k = walkDep(s)
		}

		if (k) return new SyntaxError(
				`illegal token references ${k}`)
	}

	// 所有的 TOKEN refs 只能是纯引用, 不能有动作
	function walkDep(s) {
		let dep = deps[s]
		for (let k in dep) {
			if (k[0] != 'r') {
				continue
			}

			let r = k.slice(1)
			if (refs.indexOf(r) != -1)
				continue

			if (plugins[r] != null) {
				refs.push(r)
				continue
			}

			if (r == 'TOKENIZE' || !defs[r] || dep[k].length)
				return `${r} by ${s}`
			refs.push(r)
			k = walkDep(r)
			if (k) return k
		}
	}

	for (let rule in deps) {
		if (rule == 'TOKENIZE' ||
			refs.indexOf(rule) != -1 ||
			tokens.indexOf('r' + rule) != -1) continue

		for (let k in deps[rule]) {
			if (tokens.indexOf(k) != -1 || k[0] != 'r')
				continue
			k = k.slice(1);
			if (k == 'TOKENIZE' ||
				plugins[k] == null && !defs[k])
				return new SyntaxError(
					`illegal references ${k} by ${rule}`)
		}
	}

	let filter = tokens.map(function(k) {
		return k && k[0] == 'r' && this[k] && k || ''
	}, TOKENIZE)

	for (let k in defs) {
		if (k == 'TOKENIZE')
			continue
		n.defs[k] = defs[k].bare(
			TOKENIZE['r' + k] && filter || tokens, plugins)
	}

	n.tokenize = defs['TOKENIZE'].bare(tokens, plugins)

	n.tokens = tokens
	return n;
};

Rules.prototype.retrans = function retrans(toks) {
	var i = 0,
		err,
		tok,
		rule,
		alts;

	this.current = null;
	if (toks == null)
		return this.bare();

	// find rulename and defined-as
	while (i < toks.length) {
		switch (toks[i].formal) {
			case ';':
				this.comments.push(new Comment(toks[i]));
				break
			case '=':
				tok = toks[i]
				break
			case 'r':
				if (tok || rule) return syntaxError(
						'unexpected rulename', toks[i].raw, toks[i].start);
				this.current = toks[i].raw
				break
			case 'w':
			case 'c':
				break
			default:
				return syntaxError(
					'unexpected token', toks[i].raw, toks[i].start);
		}
		i++
		if (tok) break
	}

	if (!tok && !this.current) return

	if (!this.current) return syntaxError(
			'expected rulename', toks[i - 1].raw, toks[i - 1].start);

	if (tok.raw != '=')
		return syntaxError(
			'expected defined-as', tok.raw, tok.start);

	if (this.defs[this.current] ||
		this.current == 'PLUGINS' && Object.keys(this.plugins).length)
		return syntaxError(
			'unexpected duplicates rule', this.current, toks[i - 1].start);

	if (this.current == 'PLUGINS') {
		setPlug(this, toks, i)
		return
	}


	this.i = i
	rule = new Choice(1, 1);
	this.first = this.first || this.current;
	this.defs[this.current] = rule;
	reduce(this, rule, toks, '');

	if (this.i != toks.length)
		return syntaxError(
			'unexpected invalid token', toks[i].raw, toks[i].start);
};

function reduce(r, alts, toks, close) {
	// Alternatives
	var min,
		max,
		tok,
		alt,
		seqs = new Serial(1, 1);

	while (!r.err && r.i < toks.length) {

		tok = toks[r.i++];

		if (tok.formal == ';') {
			r.comments.push(new Comment(tok));
			continue
		}
		if (!tok.formal || tok.formal == 'w' || tok.formal == 'c') continue

		if (close && tok.formal == close) break;

		if (tok.formal == '*') { // Repeat
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

		switch (tok.formal) {
			case 'r':
				seqs.push(addRef(r, new Action(tok, min, max)));
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
			case 'b':
			case 'd':
			case 'x':
				seqs.push(addTerm(r, tok, new Binary(tok, min, max)));
				break;

			case 's': // case-sensitive string, DQUOTE or prose-val
			case 'i': // case-insensitive string
				seqs.push(addTerm(r, tok, new Text(tok, min, max)));
				break;
		}

	}
	if (seqs.seqs.length) alts.push(seqs);
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
	var i = tok.raw.indexOf('-');
	this.min = min;
	this.max = max;
	this.ref = i == -1 && tok.raw || tok.raw.slice(0, i);
	this.action = tok.raw.slice(this.ref.length);
}

Action.prototype.bare = function bare(tokens, plugins) {
	var n = create();
	n.min = this.min;
	n.max = this.max;
	n.kind = plugins[this.ref] != null && 'P' || 'r'
	n.token = tokens.indexOf('r' + this.ref)
	n.ref = this.ref;
	if (n.token == -1)
		n.token = 0

	if (n.kind == 'P') {
		n.method = this.action;
		return n
	}

	if (!this.action) return n

	n.kind = 'a'

	let actions = this.action.slice(1).split('-')

	if (!actions.length || !actions[actions.length - 1]) {
		actions.pop();
		n.type = this.ref;
	}

	if (actions.length)
		n.method = actions.shift() || 'to';
	if (actions.length)
		n.key = actions.shift();
	if (!n.type && actions.length)
		n.type = actions.shift();

	return n;
}

function Text(tok, min, max) {
	this.min = min;
	this.max = max;
	this.kind = tok.formal == 'i' &&
		tok.raw.toLowerCase() != tok.raw.toUpperCase() && 'i' || 's';

	this.raw = this.kind == 'i' && tok.raw.toLowerCase() || tok.raw;
}

Text.prototype.bare = function bare(tokens) {
	var n = create();
	n.min = this.min;
	n.max = this.max;
	n.kind = this.kind; // case-sensitive / case-insensitive
	n.token = tokens.indexOf(n.kind + this.raw)
	n.raw = this.raw;
	if (n.token == -1)
		n.token = 0
	return n;
}

function Binary(tok, min, max) {
	this.min = min;
	this.max = max;
	this.kind = tok.formal; // b,d,x
	this.raw = tok.raw.toLowerCase()

	this.fields = this.raw.split(/[.-]/).map(function(s) {
		return parseInt(s, this);
	}, tok.formal == 'b' && 2 || tok.formal == 'd' && 10 || 16);

	this.isRange = this.fields.length == 2 && this.raw.indexOf('-') != -1;
}

Binary.prototype.bare = function bare(tokens) {
	var n = create();
	n.min = this.min;
	n.max = this.max;

	if (this.isRange) {
		n.kind = 'R';
		n.first = this.fields[0]
		n.last = this.fields[1]
	} else if (this.fields.length == 1) {
		n.kind = 'B';
		n.value = this.fields[0]
	} else {
		n.kind = 'S';
		n.seqs = this.fields.slice(0);
	}

	n.token = tokens.indexOf(n.kind + this.raw)
	if (n.token == -1)
		n.token = 0

	return n;
}

function Choice(min, max) {
	this.min = min;
	this.max = max;
	this.alts = [];
}

Choice.prototype.bare = function bare(tokens, plugins) {
	var n;
	if (this.alts.length == 1) {
		if (this.min == 1 && this.max == 1)
			n = this.alts[0].bare(tokens, plugins);
		else if (this.alts[0].min == 1 && this.alts[0].max == 1) {
			n = this.alts[0].bare(tokens, plugins);
			n.min = this.min;
			n.max = this.max;
		}
	}
	if (!n) {
		n = create();
		n.min = this.min;
		n.max = this.max;
		n.kind = 'A'; // Alternatives
		n.seqs = this.alts.map(function(o) {
			return o.bare(tokens, plugins);
		});
	}
	return n;
};

Choice.prototype.push = function(n) {
	// N instanceof Serial
	if (n.seqs.length == 1 && n.min == 1 && n.max == 1) {
		var m = n.seqs[0];// Support precedences
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

Serial.prototype.bare = function bare(tokens, plugins) {
	var n;
	if (this.seqs.length == 1) {
		if (this.min == 1 && this.max == 1)
			n = this.seqs[0].bare(tokens, plugins);
		else if (this.seqs[0].min == 1 && this.seqs[0].max == 1) {
			n = this.seqs[0].bare(tokens, plugins);
			n.min = this.min;
			n.max = this.max;
		}
	}

	if (!n) {
		n = create();
		n.min = this.min;
		n.max = this.max;
		n.kind = 'C'; // Concatenation
		n.seqs = this.seqs.map(function(o) {
			return o.bare(tokens, plugins);
		});
	}
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

module.exports = Rules;
