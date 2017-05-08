"use strict"
var test = require('./test'),
	ASON = require('../lib/ason'),
	core = require('../lib/core');

var grammarThousands = [
		'Array     = 1*(Number- [SP])',
		'Number    = 1*3DIGIT-lit *("," 3DIGIT-lit)',
		'DIGIT     = %x30-39',
		'SP        = %x20'
	].join('\n'),
	grammarThousandsSign = [
		'Array     = 1*(Number- [SP])',
		'Number    = [sign-lit] 1*3DIGIT-lit *("," 3DIGIT-lit)',
		'sign      = "+" / "-"',
		'DIGIT     = %x30-39',
		'SP        = %x20'
	].join('\n'),
	grammarThousandsOperator = [
		'Array     = 1*(Number- [SP])',
		'Number    = *sign-lit-sign 1*3DIGIT-lit-raw *("," 3DIGIT-lit-raw)',
		'sign      = "+" / "-"',
		'DIGIT     = %x30-39',
		'SP        = %x20'
	].join('\n'),
	grammarActions = [
		'action    = name--ref ["-" Action-factors-action-]',
		'name      = raw-lit',
		'Action    = [name--method] [',
		'            "-" [name--key] [',
		'            "-" [name--type] [',
		'            "-" [extra--extra]]]]',
		'extra     = extras-lit',
		'extras    = 1*(ALPHA / DIGIT / "-")',
		'raw       = 1*(ALPHA / DIGIT)',
		'ALPHA     = %x41-5A / %x61-7A', 'DIGIT   = %x30-39'
	].join('\n'),
	grammarArithmetic = [
		'Expression   = (NumericExpr- /',
		'                UnaryExpr-prefix- /',
		'                group-alone)',
		'               [BinaryExpr-infix-left-]',
		'group        = "(" Expression ")"',
		'UnaryExpr    = minus-lit-operator Expression--operand',
		'BinaryExpr   = operator-precedence-operator Expression--right',
		'NumericExpr  = 1*3DIGIT-lit *("," 3DIGIT-lit)',
		'minus        = "-"',
		'operator     = ("+" / "-") / ("*" / "/")',
		'DIGIT        = %x30-39',
	].join('\n'),
	arithmetics = [
		['-1', '[-1]'],
		['1-2*3', '[1-[2*3]]'],
		['1*2-3', '[[1*2]-3]'],
		['-1-2*-3', '[[-1]-[2*[-3]]]'],
		['-(1--2)*-3', '[[-[1-[-2]]]*[-3]]'],
		['-1*((2--3)*4)', '[[-1]*[[2-[-3]]*4]]'],
		['(((-1*((((2--3)))*4))))', '[[-1]*[[2-[-3]]*4]]'],
		['-1+-2--3+-4', '[[[[-1]+[-2]]-[-3]]+[-4]]'],
		['1*2/3*4', '[[[1*2]/3]*4]'],
		['1+2/3*4', '[1+[[2/3]*4]]'],
		['-1,234+5', '[[-1234]+5]'],
	],
	grammarExpression = [
		'first        = ACTIONS-CRLF Expression',
		'Expression   = ( NumericExpr- /',
		'               UnaryExpr-prefix- /',
		'               group-alone /',
		'               computed )',
		'               [UpdateExpr-ahead-operand- / BinaryExpr-infix-left- ]',

		'computed     = Ident- *(DotExpr-ahead-object- / IndexExpr-ahead-object- / CallExpr-ahead-callee-)',
		'DotExpr      = "." Ident--property-',
		'IndexExpr    = "[" Expression--property "]"',
		'CallExpr     = "(" [arguments-factors-arguments] ")"',

		'arguments    = Expression-alone *("," Expression-alone)',

		'group        = "(" Expression ")"',
		'UpdateExpr   = suffix-lit-operator',
		'UnaryExpr    = prefix-lit-operator Expression--operand',
		'BinaryExpr   = ( infix-precedence-operator /',
		'               SP infixSymbol-precedence-operator SP)',
		'               Expression--right',
		'NumericExpr  = 1*DIGIT-lit',

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
		['i', 'i'],
		['i.j', '[ij]'],
		['i.j.k', '[[ij]k]'],
		['i.j.k.l', '[[[ij]k]l]'],
		['i[j]', '[ij]'],
		['i()', '[i]'],
		['i.j()', '[[ij]]'],
		['i.j(1)', '[[ij][1]]'],
		['i(j+2)', '[i[[j+2]]]'],
		['i(j+2,k)', '[i[[j+2]k]]'],
		['i.i(j+2,k)', '[[ii][[j+2]k]]'],
		['i++', '[i++]'],
		['++i', '[++i]'],
		['++i++', '[++[i++]]'],
		['i.j()+k*l', '[[[ij]]+[k*l]]'],
		['i and k or l', '[[iandk]orl]'],
		['i.i(j+2,k)+i and k or l', '[[[[[ii][[j+2]k]]+i]andk]orl]'],
	],
	grammarSupplyChain = [
		'first        = ACTIONS-OUTDENT ACTIONS-MUST ACTIONS-FLAG grammar',
		'grammar      = OUTDENT Expression',
		'Expression   = ( Numeric-leaf- /',
		'               Unary-prefix- /',
		'               group-next /',
		'               supply)',
		'               [Update-ahead-operand- / Binary-infix-left- ]',

		'expressions  = OUTDENT Expression *(*SP "," WSP Expression)',

		'Ident        = 1*ALPHA-lit',

		'supply       = Ident- [Chain-ahead-first-]',
		'Chain        = 1*(chain-next-chains FLAG)',
		'chain        = "." Dot-factors- / list-next / call-next',
		'Dot          = OUTDENT MUST WSP Ident--operand-',
		'list         = "[" List-factors-',
		'List         = OUTDENT MUST WSP expressions-factors-elts FLAG WSP [","] WSP "]"',
		'call         = "(" Call-factors-',
		'Call         = OUTDENT MUST WSP [expressions-factors-args FLAG] WSP ")"',

		'group        = "(" groupExpr-alone',
		'groupExpr    = OUTDENT MUST WSP Expression WSP ")"',

		'Update       = suffix-lit-operator',
		'Unary        = prefix-lit-operator Expression--operand',
		'Binary       = ( *SP infix-precedence-operator WSP /',
		'               1*SP infixSymbol-precedence-operator CWSP)',
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
	].join('\n'),
	grammarObject = '\n\
		first   = Number- / Object-factors-\n\
		Object  = "{" [Pair- *("," Pair-)] "}"\n\
		Pair    = 1*ALPHA-lit ":" first\n\
		Number  = 1*DIGIT-lit\n\
		ALPHA   = %x41-5A / %x61-7A\n\
		DIGIT   = %x30-39',
	object = [
		['{a:1,b:{c:2}}',
			'Object[Pair["a",Number"1"],Pair["b",Object[Pair["c",Number"2"]]]]'
		],
	];

test('lit note leaf', function(t) {
	var product, actual,
		src = '123ABCefg456\n',
		expected = 'Number--"123",!"ABC","efg",Number"456",_Note~0""',
		grammarNote = [
			'first  = ACTIONS-FLAG Number- FLAG-- note-note raw-customize Number- Note-leaf-0-_Note',
			'raw    = 1*alpha-lit',
			'Note   = empty-lit %x0A',
			'empty  = *alpha',
			'note   = 1*ALPHA-lit',
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

test('actions property', function(t) {
	[
		[
			grammarActions,
			'ref-method-key-type-extra-extra', '~ref"ref",Action~action[~method"method",~key"key",~type"type",~extra"extra-extra"]', 'actions'
		],
		[
			grammarThousands,
			'0,234 678', 'Number"0234",Number"678"', 'thousands',
		],
		[
			grammarThousandsSign,
			'0,234 678', 'Number"0234",Number"678"', 'thousands sign',
		],
		[
			grammarThousandsSign,
			'-0,234 678', 'Number"-0234",Number"678"', 'thousands sign',
		],
		[
			grammarThousandsOperator,
			'0,234 678', 'Number[~raw"0234"],Number[~raw"678"]', 'thousands operator',
		],
		[
			grammarThousandsOperator,
			'+-0,234 678', 'Number[~sign"+-",~raw"0234"],Number[~raw"678"]', 'thousands operator',
		],
	].forEach(function(a, i) {
		var abnf = a[0],
			src = a[1],
			expected = a[2],
			message = a[3] || i,
			actual = [],
			actions = new core.Actions(src),
			product = core.tokenize(abnf, core.Entries, core.Rules, actions);

		t.errify(product, [message, actions.factors])
		actual = ASON.serialize(product)
		t.equal(actual, expected, message, [src, expected, actual, product]);
	});
});

test('actions arithmetic', function(t) {
	var actions,
		rules = core.tokenize(grammarArithmetic, core.Entries, core.Rules);

	t.errify(rules);
	actions = new core.Actions(rules);

	arithmetics.forEach(function(a, i) {
		var src = a[0],
			expected = a[1],
			actual = [],
			product = actions.parse(src);

		t.errify(product, [src, actions.factors])

		product.forEach(group, actual)
		actual = actual.join('')
		t.equal(actual, expected, 'arithmetic', [src, expected, actual, product]);
	})
})

test('actions expression', function(t) {
	var actions,
		rules = core.tokenize(grammarExpression, core.Entries, core.Rules);

	t.errify(rules);
	actions = new core.Actions(rules);

	expressions.forEach(function(a) {
		var src = a[0],
			expected = a[1],
			actual = [],
			product = actions.parse(src);

		t.errify(product, [src, actions.factors])

		product.forEach(group, actual)
		actual = actual.join('')
		t.equal(actual, expected, 'expression', [src, expected, actual, product]);
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
			'Call+chains[+args['+
			'Binary[Ident~left"j",~operator"and",'+
			'Binary~right[Numeric~left"1",~operator"+",Numeric~right"2"]],'+
			'Binary[Ident~left"k",~operator"or",Ident~right"l"]'+
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
		['i.i(j and 1+2,k or l)[3]', last],
		['i.\n\ti(\n\tj and\n\t1 + \n\t2 ,\n\tk or l\n\t)[\n\t3,]', last],
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

test('object', function(t) {
	var actions,
		rules = core.tokenize(grammarObject, core.Entries, core.Rules);

	t.errify(rules);
	actions = new core.Actions(rules);

	object.forEach(function(a) {
		var src = a[0],
			expected = a[1],
			actual,
			product = actions.parse(src);

		t.errify(product, [src, actions.factors])
		actual = ASON.serialize(product)
		t.equal(actual, expected, expected, [actual, src, product]);
	})
});

test('ident', function(t) {
	var grammar = '\
		first = ident-lit--Ident\n\
		ident = 1*ALPHA [["-"] 1*(ALPHA / DIGIT)]\n\
		ALPHA = %x41-5A / %x61-7A\n\
		DIGIT = %x30-39',
		product = core.tokenize(grammar, core.Entries, core.Rules,
			new core.Actions('utf-8'));

	t.errify(product)
	t.equal(product.length, 1)
	t.equal(product[0].raw, 'utf-8')
});

function group(p) {
	if (p.raw) this.push(p.raw)
	if (p.factors) {
		this.push('[')
		p.factors.forEach(group, this)
		this.push(']')
	}
}