"use strict"

// http://commonmark.org/
// https://python-ast-explorer.com/
// https://astexplorer.net/
// https://docs.python.org/3/library/ast.html

var test = require('./test'),
	core = require('../lib/core'),
	ASON = require('../lib/ason'),
	common = [
		'WSP    = SP / HTAB',
		'CWSP   = WSP / CRLF',
		'HTAB   = %x09',
		'SP     = %x20',
		'ALPHA  = %x41-5A / %x61-7A',
		'DIGIT  = %x30-39',
	].join('\n'),
	grammarCRLF = [
		'first  = ACTIONS-CRLF 1*(*CWSP i-lit-) *CWSP',
		'i      = "i"/"h"',
		common,
	].join('\n'),
	grammarFLAG = [
		'first   = ACTIONS-FLAG Object- *(" " Object-)',
		'Object  = "." Member--property- FLAG-pub / Member--property-',
		'Member  = 1*ALPHA-lit',
		common,
	].join('\n'),
	grammarPythonIndent = [
		'first      = ACTIONS-OUTDENT ACTIONS-DENY topStmts',
		'topStmts   = *CRLF statement *(CRLF statement) *CRLF',
		'stmts      = OUTDENT CRLF statement *(CRLF statement)',
		'statement  = if-reset / expression',
		'if         = "if" 1*SP ifCell-factors--if',
		'ifCell     = OUTDENT- expression--test ":" *SP',
		'             (expression-list-body / stmts-list-body)',
		'             [CRLF (else-reset / elif-reset)]',
		'elif       = "elif" 1*SP ifCell-list-orelse-if',
		'else       = "else:" *SP',
		'             (expression-list-orelse / stmts-list-orelse)',
		'ident      = Ident-lit- DENY-keywords [Call-amend-func-]',
		'keywords   = "class" / "if" / "else" / "elif"',
		'Ident      = ALPHA *(ALPHA / DIGIT)',
		'Num        = 1*DIGIT',
		'expression = (ident / Num-lit- / Set-factors- / List-factors- / Dict-factors- / group-alone) *WSP',
		'elements   = OUTDENT- [CRLF] expression *("," *WSP [CRLF] expression ) [CRLF]',
		'group      = "(" OUTDENT- [CRLF] expression [CRLF] ")"',
		'List       = "[" [elements-list-elts] "]"',
		'Set        = "{" [elements-list-elts] "}"',
		'Dict       = "{" [pairs] "}"',
		'pair       = expression-list-keys ":" *WSP expression-list-values',
		'pairs      = OUTDENT- [CRLF] pair *("," *WSP [CRLF] pair) [CRLF]',
		'Call       = args-list-args',
		'args       = "()" / "(" [elements] ")"',
		common,
	].join('\n'),
	grammarExpression = [
		'first        = ACTIONS-CRLF ACTIONS-FLAG ACTIONS-MUST Expression',
		'Expression   = ( Num- /',
		'               Unary-prefix- /',
		'               "(" Expression-alone ")" /',
		'               computed )',
		'               [Update-amend-elt- / Binary-infix-left- ]',

		'computed     = Ident- *(Dot-amend-object- / Index-amend-object- / Call-amend-func-)',
		'Dot          = "." MUST Ident--property-',
		'Index        = "[" MUST Expression--index "]"',
		'Call         = "(" MUST arguments-list-args")"',

		'arguments    = [Expression-alone *("," MUST Expression-alone)]',

		'Update       = suffix-lit-op',
		'Unary        = prefix-lit-op Expression--elt',
		'Binary       = ( infix-operator-op /',
		'               SP infixSymbol-operator-op SP)',
		'               Expression--right',
		'Num          = 1*DIGIT-lit',

		'prefix       = "--" / "++" / "-"',
		'suffix       = "--" / "++"',
		'infix        = ("") / ("") / ("+" / "-") / ("*" / "/")',
		'infixSymbol  = ("or") / ("and")',

		'Ident        = 1*ALPHA-lit',
		'SP           = %x20',
		'ALPHA        = %x41-5A / %x61-7A',
		'DIGIT        = %x30-39',
	].join('\n'),
	expressions = [
		['i', 'Ident"i"'],
		['i.j', 'Dot[Ident~object"i",Ident~property"j"]'],
		['i.j.k', 'Dot[' +
			'Dot~object[Ident~object"i",Ident~property"j"]' +
			',Ident~property"k"]'
		],
		['i.j.k.l', 'Dot[' +
			'Dot~object[Dot~object[Ident~object"i",Ident~property"j"],Ident~property"k"]' +
			',Ident~property"l"]'
		],
		['i[j]', 'Index[Ident~object"i",Ident~index"j"]'],
		['i()', 'Call[Ident~func"i",+args[]]'],
		['i.j()', 'Call[Dot~func[Ident~object"i",Ident~property"j"],+args[]]'],
		['i.j(1)', 'Call[Dot~func[Ident~object"i",Ident~property"j"],+args[Num"1"]]'],
		['i(j+2)', 'Call[Ident~func"i",+args[' +
			'Binary[Ident~left"j",~op"+",Num~right"2"]' +
			']]'
		],
		['i(j+2,k)', 'Call[Ident~func"i",+args[Binary[Ident~left"j",~op"+",Num~right"2"],Ident"k"]]'],
		['i.i(j+2,k)', 'Call[Dot~func[Ident~object"i",Ident~property"i"],+args[Binary[Ident~left"j",~op"+",Num~right"2"],Ident"k"]]'],
		['i++', 'Update[Ident~elt"i",~op"++"]'],
		['++i', 'Unary[~op"++",Ident~elt"i"]'],
		['++i++', 'Unary[~op"++",Update~elt[Ident~elt"i",~op"++"]]'],
		['i.j()+k*l', 'Binary[' +
			'Call~left[Dot~func[Ident~object"i",Ident~property"j"],+args[]]' +
			',~op"+",' +
			'Binary~right[Ident~left"k",~op"*",Ident~right"l"]' +
			']'
		],
		['i and j or k', 'Binary[' +
			'Binary~left[Ident~left"i",~op"and",Ident~right"j"]' +
			',~op"or",' +
			'Ident~right"k"' +
			']'
		],
		['i.i(j+2,k)+i and k or l', 'Binary[' +
			'Binary~left[' +
			'' + 'Binary~left[' +
			'' + '' + 'Call~left[Dot~func[Ident~object"i",Ident~property"i"],+args[Binary[Ident~left"j",~op"+",Num~right"2"],Ident"k"]]' +
			'' + '' + ',~op"+",' +
			'' + '' + 'Ident~right"i"' +
			'' + ']' +
			'' + ',~op"and",' +
			'' + 'Ident~right"k"' +
			']' +
			',~op"or",' +
			'Ident~right"l"' + ']'
		],
	],
	grammarSupplyChain = [
		'first        = ACTIONS-OUTDENT ACTIONS-MUST ACTIONS-FLAG grammar',
		'grammar      = OUTDENT Expression',
		'Expression   = ( Numeric-leaf- /',
		'               Unary-prefix- /',
		'               "(" groupExpr-alone ")" /',
		'               supply)',
		'               [Update-amend-operand- / Binary-infix-left- ]',

		'expressions  = OUTDENT- Expression *(*SP "," WSP Expression)',

		'Ident        = 1*ALPHA-lit',

		'supply       = Ident- [Chain-amend-first-]',
		'Chain        = 1*(chain-reset-chains)',
		'chain        = "." Dot-list- / "[" List-list- "]" / call-reset',
		'Dot          = OUTDENT MUST WSP Ident--operand-',
		'List         = OUTDENT MUST WSP expressions-list-elts WSP [","] WSP',
		'call         = "(" Call-list- ")"',
		'Call         = OUTDENT- MUST WSP [expressions-list-args] WSP',

		'groupExpr    = OUTDENT- MUST WSP Expression WSP',

		'Update       = suffix-lit-operator',
		'Unary        = prefix-lit-operator Expression--operand',
		'Binary       = ( *SP infix-operator-operator WSP /',
		'               1*SP infixSymbol-operator-operator CWSP)',
		'               Expression--right',
		'Numeric      = 1*DIGIT',

		'prefix       = "--" / "++" / "-"',
		'suffix       = "--" / "++"',
		'infix        = ("") / ("") / ("+" / "-") / ("*" / "/")',
		'infixSymbol  = ("or") / ("and")',

		'SP           = %x20',
		'HTAB         = %x09',
		'WSP          = *SP [CRLF]',
		'CWSP         = 1*SP [CRLF] / CRLF',
		'ALPHA        = %x41-5A / %x61-7A',
		'DIGIT        = %x30-39',
	].join('\n');

test('crlf', function(t) {
	var actions = core.tokenize(grammarCRLF, core.Entries, core.Rules, core.Actions);

	t.errify(actions);

	[
		['i', 'i(1:1-1:2)'],
		['i\n', 'i(1:1-1:2)'],
		['\n\ni', 'i(3:1-3:2)'],
		['\n \t\n\ti', 'i(3:2-3:3)'],
		['i ii', 'i(1:1-1:2)i(1:3-1:4)i(1:4-1:5)'],
		['i\ni ii', 'i(1:1-1:2)i(2:1-2:2)i(2:3-2:4)i(2:4-2:5)'],
		['i\n\ni  ', 'i(1:1-1:2)i(3:1-3:2)'],
		['h\n\nh\n', 'h(1:1-1:2)h(3:1-3:2)'],
		['i\n\n i  ', 'i(1:1-1:2)i(3:2-3:3)'],
		['i\n\n i i\n', 'i(1:1-1:2)i(3:2-3:3)i(3:4-3:5)'],
	].forEach(function(a) {
		var src = a[0],
			expected = a[1],
			actual = [],
			product = this.parse(src);

		t.errify(product, expected)

		product.forEach(groupLoc, actual)

		t.equal(actual.join(''), expected, expected, [actual, this.eols.join(','), product, ]);

	}, actions)
})

test('lit note leaf', function(t) {
	var product, actual,
		src = '123ABCefg456\n',
		expected = 'Number--"123",!"ABC","efg",Number"456",_Note~0""',
		grammarNote = [
			'first  = ACTIONS-FLAG Number- FLAG-- note-note raw-customize Number- Note-leaf-0-_Note %x0A',
			'raw    = 1*alpha-lit',
			'Note   = *alpha',
			'note   = 1*ALPHA',
			'Number = 1*DIGIT-lit',
			'ALPHA  = %x41-5A',
			'alpha  = %x61-7A',
			'DIGIT   = %x30-39',
		].join('\n'),
		actions = core.tokenize(grammarNote, core.Entries, core.Rules, core.Actions);

	t.errify(actions)
	product = actions.parse(src);
	t.errify(product, [actions.factors])
	actual = ASON.serialize(product)
	t.equal(actual, expected, expected, [actual, product]);
})

test('flag', function(t) {
	var actions = core.tokenize(grammarFLAG,
		core.Entries, core.Rules, core.Actions);

	t.errify(actions);

	[
		['i', 'Object[Member~property"i"]'],
		['.i', 'Object[Member-pub~property"i"]'],
		['i .x', 'Object[Member~property"i"],Object[Member-pub~property"x"]'],
	].forEach(function(a) {

		var src = a[0],
			expected = a[1],
			actual = [],
			product = actions.parse(src);

		t.errify(product, src)
		actual = ASON.serialize(product)
		t.equal(actual, expected, expected, [actual, src, product]);
	})
})

test('python indent', function(t) {
	var actions = core.tokenize(grammarPythonIndent, core.Entries,
		core.Rules, core.Actions);

	t.errify(actions);
	[
		['i', 'Ident"i"'],
		['do()', 'Call[Ident~func"do",+args[]]'],
		['i\nx', 'Ident"i",Ident"x"'],
		['\ni', 'Ident"i"'],
		['\ni\nx', 'Ident"i",Ident"x"'],
		['i\nx', 'Ident"i",Ident"x"'],
		['{i,1}', 'Set[+elts[Ident"i",Num"1"]]'],
		['{a:1,b:2}', 'Dict[+keys[Ident"a"],+values[Num"1"],+keys[Ident"b"],+values[Num"2"]]'],
		['if t:\ndo', ''],
		['if t:do    ', 'if[Ident~test"t",+body[Ident"do"]]'],
		['if t:\n\tdo', 'if[Ident~test"t",+body[Ident"do"]]'],
		['if [t]:\n\tdo', 'if[List~test[+elts[Ident"t"]],+body[Ident"do"]]'],
		['if (t):\n\ti\n\tx', 'if[Ident~test"t",+body[Ident"i",Ident"x"]]'],
		['if (t): {i}', 'if[Ident~test"t",+body[Set[+elts[Ident"i"]]]]'],
		['if (t): {\n\ti\n}', 'if[Ident~test"t",+body[Set[+elts[Ident"i"]]]]'],
		['if (t):[i]\n', 'if[Ident~test"t",+body[List[+elts[Ident"i"]]]]'],
		['if (t):[i,x]', 'if[Ident~test"t",+body[List[+elts[Ident"i",Ident"x"]]]]'],

		['if t:do \nelse:\ni', ''],
		['if t:do \nelse:i\n',
			'if[Ident~test"t",+body[Ident"do"],+orelse[Ident"i"]]'
		],

		['if t:do \nelse:\n\ti\n\tx ',
			'if[Ident~test"t",+body[Ident"do"],+orelse[Ident"i",Ident"x"]]'
		],
		['if t:do \nelse:\n\t\ti\n\t\tx',
			'if[Ident~test"t",+body[Ident"do"],+orelse[Ident"i",Ident"x"]]'
		],

		['if t:do \nelse:\n\ti\n\tx\ndo()',
			'if[Ident~test"t",+body[Ident"do"],+orelse[Ident"i",Ident"x"]]' +
			',Call[Ident~func"do",+args[]]'
		],

		['if t: do\nelif x:do',
			'if[Ident~test"t",+body[Ident"do"],' +
			'if+orelse[Ident~test"x",+body[Ident"do"]]' +
			']'
		],
		['if t:do \nelif t: do\nelse:\n\ti\n\tx\ndo()',
			'if[Ident~test"t",+body[Ident"do"],' +
			'if+orelse[Ident~test"t",+body[Ident"do"],+orelse[Ident"i",Ident"x"]]' +
			']' +
			',Call[Ident~func"do",+args[]]'
		],
		[
			[
				'if t:',
				'	if t: do',
				'	else:',
				'		i',
				'		x',
				'do(x)',
			].join('\n'),
			'if[Ident~test"t",+body[' +
			'if[Ident~test"t",+body[Ident"do"],+orelse[Ident"i",Ident"x"]]' +
			']]' +
			',Call[Ident~func"do",+args[Ident"x"]]'
		],
	].forEach(function(a, i) {
		var product, actual, src = a[0],
			expected = a[1];

		product = actions.parse(src)

		if (!expected)
			return Array.isArray(product) &&
				t.fail('want error', [src, ASON.serialize(product)]) ||
				t.pass('got error')
		t.errify(product, [src, actions.factors])
		actual = ASON.serialize(product)
		t.equal(actual, expected, expected, [actual, src, product]);
	});
})

test('actions expression', function(t) {
	var actions = core.tokenize(grammarExpression, core.Entries, core.Rules, core.Actions);

	t.errify(actions);

	expressions.forEach(function(a) {
		var src = a[0],
			expected = a[1],
			actual = [],
			product = actions.parse(src);

		t.errify(product, [src, actions.factors])
		actual = ASON.serialize(product)
		t.equal(actual, expected, expected, [actual, src, product]);
	})
});

test('supply chain', function(t) {
	var chain = function() {
			return 'Chain[Ident~first"i",' +
				Array.prototype.join.call(arguments, ',') + ']'
		},
		j2 = 'Binary[Ident~left"j",~operator"+",Numeric~right"2"]',
		// i.i(j and 1+2 ,k or l)[3]
		last = chain(
			'Dot+chains[Ident~operand"i"]',
			'Call+chains[+args[' +
			'Binary[Ident~left"j",~operator"and",' +
			'Binary~right[Numeric~left"1",~operator"+",Numeric~right"2"]],' +
			'Binary[Ident~left"k",~operator"or",Ident~right"l"]' +
			']]',
			'List+chains[+elts[Numeric"3"]]'
		);

	var actions,
		rules = core.tokenize(grammarSupplyChain, core.Entries, core.Rules);

	t.errify(rules);
	actions = new core.Actions(rules);

	[
		['i', 'Ident"i"'],
		['i.j', chain('Dot+chains[Ident~operand"j"]')],
		['i.j.k', chain(
			'Dot+chains[Ident~operand"j"]',
			'Dot+chains[Ident~operand"k"]'
		)],
		['i.j.k.l', chain(
			'Dot+chains[Ident~operand"j"]',
			'Dot+chains[Ident~operand"k"]',
			'Dot+chains[Ident~operand"l"]'
		)],
		['i[j]', chain('List+chains[+elts[Ident"j"]]')],
		['i()', chain('Call+chains[]')],
		['i.j()', chain('Dot+chains[Ident~operand"j"]', 'Call+chains[]')],
		['i.j(1)', chain(
			'Dot+chains[Ident~operand"j"]',
			'Call+chains[+args[Numeric"1"]]'
		)],
		['i(j+2)', chain('Call+chains[+args[' + j2 + ']]')],
		['i(j+2,k)', chain('Call+chains[+args[' + j2 + ',Ident"k"]]')],
		['i.i(j+2,k)', chain(
			'Dot+chains[Ident~operand"i"]',
			'Call+chains[+args[' + j2 + ',Ident"k"]]')],
		['i.j()+k*l', 'Binary[' +
			'Chain~left[Ident~first"i",Dot+chains[Ident~operand"j"],Call+chains[]],' +
			'~operator"+",' +
			'Binary~right[Ident~left"k",~operator"*",Ident~right"l"]]'
		],
		['k*l+i.j()', 'Binary[' +
			'Binary~left[Ident~left"k",~operator"*",Ident~right"l"],' +
			'~operator"+",' +
			'Chain~right[Ident~first"i",Dot+chains[Ident~operand"j"],Call+chains[]]]'
		],
		['i.\n\ti(j and 1+2,\n\t\tk or l)[3]', last],
		['i.i(\n\tj and\n\t1 + \n\t2 ,\n\tk or l\n)[\n\t3,]', last],
	].forEach(function(a) {
		var src = a[0],
			expected = a[1],
			actual = [],
			product = actions.parse(src);

		t.errify(product, [src, actions.factors])
		actual = ASON.serialize(product)
		t.equal(actual, expected, expected, [actual, src, product]);
	})
});

function groupLoc(p) {
	var loc = p.loc;
	if (p.raw) this.push(p.raw)

	this.push('(' +
		loc.startLine + ':' + loc.startCol + '-' +
		loc.endLine + ':' + loc.endCol + ')')
}