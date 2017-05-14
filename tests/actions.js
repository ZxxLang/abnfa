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
		'Expression   = (Num- /',
		'                Unary-prefix- /',
		'                group-alone)',
		'               [Binary-infix-left-]',
		'group        = "(" Expression ")"',
		'Unary        = minus-lit-op Expression--elt',
		'Binary       = operator-operator-op Expression--right',
		'Num          = 1*3DIGIT-lit *("," 3DIGIT-lit)',
		'minus        = "-"',
		'operator     = ("+" / "-") / ("*" / "/")',
		'DIGIT        = %x30-39',
	].join('\n'),
	arithmetics = [
		['-1', 'Unary[~op"-",Num~elt"1"]'],
		['1-2*3', 'Binary[Num~left"1",~op"-",Binary~right[Num~left"2",~op"*",Num~right"3"]]'],
		['1*2-3', 'Binary[Binary~left[Num~left"1",~op"*",Num~right"2"],~op"-",Num~right"3"]'],
		['-1-2*-3', 'Binary[Unary~left[~op"-",Num~elt"1"],~op"-",Binary~right[Num~left"2",~op"*",Unary~right[~op"-",Num~elt"3"]]]'],
		['-(1--2)*-3', 'Binary[' +
			'Unary~left[~op"-",Binary~elt[Num~left"1",~op"-",Unary~right[~op"-",Num~elt"2"]]]' +
			',~op"*",' +
			'Unary~right[~op"-",Num~elt"3"]' + ']'
		],
		['-1*((2--3)*4)', 'Binary[' +
			'Unary~left[~op"-",Num~elt"1"]' +
			',~op"*",' +
			'Binary~right[Binary~left[Num~left"2",~op"-",Unary~right[~op"-",Num~elt"3"]]' +
			',~op"*",Num~right"4"]' + ']'
		],
		['(((-1*((((2--3)))*4))))', 'Binary[' +
			'Unary~left[~op"-",Num~elt"1"]' +
			',~op"*",' +
			'Binary~right[Binary~left[Num~left"2",~op"-",Unary~right[~op"-",Num~elt"3"]]' +
			',~op"*",Num~right"4"]' + ']'
		],
		['-1+-2--3+-4', 'Binary[' +
			'Binary~left[' +
			'' + 'Binary~left[' +
			'' + '' + 'Unary~left[~op"-",Num~elt"1"],~op"+",' +
			'' + '' + 'Unary~right[~op"-",Num~elt"2"]' +
			'' + '],~op"-",' +
			'' + 'Unary~right[~op"-",Num~elt"3"]' +
			'],~op"+",' +
			'Unary~right[~op"-",Num~elt"4"]' + ']'
		],
		['1*2/3*4', 'Binary[' +
			'Binary~left[' +
			'' + 'Binary~left[' +
			'' + '' + 'Num~left"1",~op"*",' +
			'' + '' + 'Num~right"2"' +
			'' + '],~op"/",' +
			'' + 'Num~right"3"' +
			'],~op"*",' +
			'Num~right"4"' + ']'
		],
		['1+2/3*4', 'Binary[' +
			'Num~left"1",~op"+",' +
			'Binary~right[' +
			'' + 'Binary~left[' +
			'' + '' + 'Num~left"2",~op"/",' +
			'' + '' + 'Num~right"3"' +
			'' + '],~op"*",' +
			'' + 'Num~right"4"' +
			']' + ']'
		],
		['-1,234+5', 'Binary[Unary~left[~op"-",Num~elt"1234"],~op"+",Num~right"5"]'],
	],
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
			actual,
			product = actions.parse(src);

		t.errify(product, [src, actions.factors])
		actual = ASON.serialize(product)
		t.equal(actual, expected, expected, [actual, src, product]);
	})
})

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

test('naked', function(t) {
	var grammar = 'first = "(" Naked- ")" \nNaked = [""]',
		product = core.tokenize(grammar, core.Entries, core.Rules,
			new core.Actions('()'));

	t.errify(product)
	t.equal(product.length, 1)
	t.equal(product[0].raw, undefined)
});