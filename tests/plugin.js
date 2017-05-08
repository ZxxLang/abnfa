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
		'first  = ACTIONS-CRLF 1*(*CWSP i-lit-)',
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
		'first      = ACTIONS-OUTDENT ACTIONS-DENY ACTIONS-FLAG topStmts',
		'topStmts   = *CRLF statement *(CRLF statement) *CRLF',
		'stmts      = OUTDENT CRLF statement *(CRLF statement)',
		'statement  = if-next / expression',
		'if         = "if" 1*SP ifCell-factors--if',
		'ifCell     = OUTDENT- expression--test ":" *SP',
		'             (expression--body /stmts-factors-body) FLAG',
		'             [CRLF (else-next / elif-next)]',
		'elif       = "elif" 1*SP ifCell-factors-orelse-if FLAG',
		'else       = "else:" *SP',
		'             (expression--orelse / stmts-factors-orelse) FLAG',
		'ident      = Ident-lit- DENY-keywords [Call-ahead-func-]',
		'keywords   = "class"/ "if" / "else" / "elif"',
		'Ident      = ALPHA *(ALPHA / DIGIT)',
		'Num        = 1*DIGIT',
		'expression = (ident / Num-lit- / Set-factors- / List-factors- / Dict-factors- / group-alone) *WSP',
		'elements   = OUTDENT- [CRLF] expression *("," *WSP [CRLF] expression ) [CRLF]',
		'group      = "(" OUTDENT- [CRLF] expression [CRLF] ")"',
		'List       = "[" [elements-factors-elts FLAG] "]"',
		'Set        = "{" [elements-factors-elts FLAG] "}"',
		'Dict       = "{" [pairs] "}"',
		'pair       = expression-alone-keys FLAG ":" *WSP expression-alone-values FLAG',
		'pairs      = OUTDENT- [CRLF] pair *("," *WSP [CRLF] pair) [CRLF]',
		'Call       = args-factors-args FLAG',
		'args       = "()" / "(" [elements] ")"',

		common,
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
		['{a:1,b:2}', 'Dict[Ident+keys"a",Num+values"1",Ident+keys"b",Num+values"2"]'],
		['if t:\ndo', ''],
		['if t:do    ', 'if[Ident~test"t",Ident+body"do"]'],
		['if t:\n\tdo', 'if[Ident~test"t",+body[Ident"do"]]'],
		['if [t]:\n\tdo', 'if[List~test[+elts[Ident"t"]],+body[Ident"do"]]'],
		['if (t):\n\ti\n\tx', 'if[Ident~test"t",+body[Ident"i",Ident"x"]]'],
		['if (t): {i}', 'if[Ident~test"t",Set+body[+elts[Ident"i"]]]'],
		['if (t): {\n\ti\n}', 'if[Ident~test"t",Set+body[+elts[Ident"i"]]]'],
		['if (t):[i]\n', 'if[Ident~test"t",List+body[+elts[Ident"i"]]]'],
		['if (t):[i,x]', 'if[Ident~test"t",List+body[+elts[Ident"i",Ident"x"]]]'],

		['if t:do \nelse:\ni', ''],
		['if t:do \nelse:i\n',
			'if[Ident~test"t",Ident+body"do",Ident+orelse"i"]'
		],

		['if t:do \nelse:\n\ti\n\tx ',
			'if[Ident~test"t",Ident+body"do",+orelse[Ident"i",Ident"x"]]'
		],
		['if t:do \nelse:\n\t\ti\n\t\tx',
			'if[Ident~test"t",Ident+body"do",+orelse[Ident"i",Ident"x"]]'
		],

		['if t:do \nelse:\n\ti\n\tx\ndo()',
			'if[Ident~test"t",Ident+body"do",+orelse[Ident"i",Ident"x"]]' +
			',Call[Ident~func"do",+args[]]'
		],

		['if t: do\nelif x:do',
			'if[Ident~test"t",Ident+body"do",' +
			'if+orelse[Ident~test"x",Ident+body"do"]' +
			']'
		],
		['if t:do \nelif t: do\nelse:\n\ti\n\tx\ndo()',
			'if[Ident~test"t",Ident+body"do",' +
			'if+orelse[Ident~test"t",Ident+body"do",+orelse[Ident"i",Ident"x"]]' +
			']' +
			',Call[Ident~func"do",+args[]]'
		],
		['if t:\n\tif t: do\n\telse:\n\t\ti\n\t\tx\ndo(x)',
			'if[Ident~test"t",+body[' +
			'if[Ident~test"t",Ident+body"do",+orelse[Ident"i",Ident"x"]]' +
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
		t.errify(product, [src,actions.factors])
		actual = ASON.serialize(product)
		t.equal(actual, expected, expected, [actual, src, product]);
	});
})

function groupLoc(p) {
	var loc = p.loc;
	if (p.raw) this.push(p.raw)

	this.push('(' +
		loc.startLine + ':' + loc.startCol + '-' +
		loc.endLine + ':' + loc.endCol + ')')
}