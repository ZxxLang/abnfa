"use strict"
var test = require('./test'),
	fs = require('fs'),
	core = require('../index'),
	ASON = core.ASON,
	path = require('path'),
	folder = path.resolve(__dirname, '../grammar'),
	grammar = fs.readFileSync(path.join(folder, 'zxx.abnf')).toString(),
	files = [path.join(folder, 'zxx.zxx')],
	actions = core.tokenize(grammar, core.Entries, core.Rules, core.Actions),
	rules = actions.rules,
	d = '20160204T21:49:01.123456789+08',
	ymd = '~year"2016",~month"02",~day"04"',
	hms = ',~hour"21",~minute"49",~second"01"',
	nano = ',~nano"123456789"',
	YMD = 'Datetime[' + ymd + ']',
	YMDHMS = 'Datetime[' + ymd + hms + ']',
	D = 'Datetime[' + ymd + hms + nano + ',~zone"+08"]',
	B = 'Binary',
	C = 'Comment',
	Doc = 'Comment-doc',
	S = 'String',
	DS = 'String-x22',
	F = 'Float',
	P = 'Package',
	I = 'Ident',
	IR = 'Ident-r',
	IW = 'Ident-w',
	Me = 'Member',
	M = 'Map',
	N = 'Num',
	Dot = 'Dot',
	Call = ['Call'],
	L = 'List',
	U = 'Unary',
	Up = 'Update',
	AS = 'Assign',
	//
	expressions,
	comments,
	statements,
	useDecls,
	defDecls,
	funDecls,
	letDecls;

if (actions instanceof Error)
	throw actions;

test('init plugins and debug', function(t) {
	var actual,
		product,
		src,
		expected;
	actions.parse('')
	return t.pass('init plugins')
	src = code(function() {
		/*
		fun fn()
			if t of true ;;dd
				_ = 1
		*/
	})[0];
	expected = 'Out[+elts[Num"1",Self"self"]]';
	product = actions.parse(src, '')
	t.errify(product, [src, actions.factors]);
	actual = ason(product)
	t.equal(actual, expected, expected, [actual, src, product]);
});
//return

function code(s) {
	return slice(arguments).map(function(s) {
		if (typeof s == 'string') return s.join('\n') + '\n'
		s = s.toString()
		s = s.slice(s.indexOf('/*') + 3, s.indexOf('*/'))
		return s.trimRight().replace(
				RegExp('^\\t{' + s.search(/[^\t]/) + '}', 'gm'), '') +
			'\n'
	})
}

function ason(a) {
	return ASON.serialize(a)
}

function want(rulename) {
	return function(a) {
		var t = this,
			codes = Array.isArray(a[0]) && a[0] || [a[0]],
			expected = typeof a[1] == 'string' && a[1] || as.apply(null, a[1]);

		codes.forEach(function(src) {
			var actual,
				len = src.length,
				product = actions.parse(src, this);

			t.errify(product, [len, src, actions.factors])
			actual = ason(product)
			t.equal(actual, expected, [expected, actual, src, product]);

		}, a[2] || rulename)
	}
}

function reduce(factors) {
	return !Array.isArray(factors) && as(factors) ||
		!Array.isArray(factors[0]) && as.apply(null, factors) ||
		factors.reduce(function(s, factors, i) {
			return s + (i && ',' || '') + reduce(factors)
		}, '')
}

function slice(args, i) {
	return Array.prototype.slice.call(args, i || 0)
}

function as(type, key, factors) {

	if (Array.isArray(type)) return reduce(slice(arguments))

	if (Array.isArray(factors)) {
		factors = '[' + reduce(factors) + ']'
	} else if (factors != null && factors[0] != '[') {
		factors = JSON.stringify(factors.toString())
	}

	if (type == C || type == Doc)
		key = '!comments'
	else if (type == 'Iota')
		factors = '"iota"'

	return (type || '') +
		(key && (key[0] != '+' && key[0] != '!' && '~' || '') + key || '') +
		(factors && factors || '')
}

function cs() {
	return Array.prototype.reduce.call(arguments,
		function(a, s) {
			a.push([C, 0, s])
			return a
		}, [])
}

function is() {
	return Array.prototype.reduce.call(arguments,
		function(a, s) {
			a.push([I, 0, s])
			return a
		}, [])
}

function doc() {
	return Array.prototype.reduce.call(arguments,
		function(a, s) {
			a.push([Doc, 0, s])
			return a
		}, [])
}

function aa() {
	return slice(arguments)
}

// Binary expression
function bin(lt, lv, op, rt, rv) {
	return aa(B, null, [
		[lt, 'left', lv],
		[null, 'op', op || '+'],
		[rt || lt, 'right', rv || lv],
	])
}

function range(lt, lv, op, rt, rv) {
	return aa('Range', null, [
		[lt, 'first', lv],
		[null, 'op', op || '..'],
		[rt || lt, 'last', rv || lv],
	])
}

function op(operator) {
	return aa(null, 'op', operator)
}

test('match failed', function(t) {
	[
		['unfinished', ""],
		['unfinished', "use 'os'\t"],
		['unfinished', "use 'os'\t'io'"],
		['rollback', "use "],
		['rollback', "use\n\t"],
		['rollback', "let "],
		['rollback', "let\n\t"],
		['rollback', "let _ =\n1"],
		['rollback', "let\n\t_ =\n1"],
		['rollback', 'let i'],
		['rollback', 'let i,'],
		['rollback', 'let i ='],
		['rollback', 'let i = _'],
		['rollback', 'let\n\ti =\n1'],
		['rollback', 'let _ = \n\t\ti.\n\tj'],
		['deny', 'let if = 2'],
		['deny', 'let void = 2'],
		['deny', 'let iota = 2'],

		['rollback', code(function() {
			/*
			use ;;illegal EOL comment
				"d"
			*/
		})[0]],
		['rollback', code(function() {
			/*
			use
				 llegal single-line comment
				"d"
			*/
		})[0]],
		['rollback', code(function() {
			/*
			let ;;illegal EOL comment
				_=1
			*/
		})[0]],
		['rollback', code(function() {
			/*
			let
				 illegal single-line comment
				_=1
			*/
		})[0]],
		['rollback', code(function() {
			/*
			let
				_=call(;;illegal EOL comment
					1
				)
			*/
		})[0]],
		['rollback', code(function() {
			/*
			let
				_=call(
					 illegal single-line comment
					1
				)
			*/
		})[0]],

	].forEach(function(a, i) {
		var err = actions.parse(a[1]);
		t.has(err.message, a[0], [i, err, actions.factors])
	})
})

test('top comments', function(t) {

	comments = [
		['\\', cs('\\')],
		['use', cs('use')],
		['let', cs('let')],
		['fun', cs('fun')],
		['def', cs('def')],
		['\n', cs('')],
		['\n\n', cs('', '')],
		['aaa\n\n', [
			[cs('aaa', '')]
		]],
		['a\n\nb', cs('a', '', 'b')],
	];
	comments.forEach(want(null), t)
})

test('literal', function(t) {
	[
		['true', 'Bool"true"', 'Ident'],
		['false', 'Bool"false"', 'Ident'],
		['null', 'Null"null"', 'Ident'],
		['iota', 'Iota"iota"', 'Ident'],
		['self', 'Self"self"', 'Ident'],
		['utf-8', 'Ident"utf-8"', 'Ident'],
		['""', as(DS, 0, '')],
		["''", as(S, 0, '')],
		['" - 123	&^%~!世界你好"', as(DS, 0, ' - 123	&^%~!世界你好')],
		['"os"', as(DS, 0, 'os')],
		["'os'", as(S, 0, 'os')],
		["'utf-8'", as(S, 0, "utf-8")],
		['"utf-8"', as(DS, 0, 'utf-8')],
		["'o\\\n\ts'", as(S, 0, "o\\\n\ts")],
		["'\"os'", as(S, 0, "\"os")],
		['"\\"1"', as(DS, 0, '\\"1')],
		['``', as('Template', 0, '')],
		['`\n\t`', as('Template', 0, '\n\t')],
		['1', 'Num"1"'],
		["-1'234", 'Num"-1234"'],
		["-2'234", 'Num"-2234"', 'Num'],
		['0xAf', 'Num"0xAf"'],
		['0b01', 'Num"0b01"'],
		['-1', 'Num"-1"'],
		['-0xAf', 'Num"-0xAf"'],
		['1e2', 'Num"1e2"'],
		['-1e-2', 'Num"-1e-2"'],
		['NaN', 'Float"NaN"'],
		['Infinity', 'Float"Infinity"'],
		['0f12345678', 'Float"0f12345678"'],
		['0f12345678ABCDabcd', 'Float"0f12345678ABCDabcd"'],
		['1.1', 'Float"1.1"'],
		["123'456.12345", 'Float"123456.12345"'],
		["123'456.123'45", 'Float"123456.12345"'],
		['-1.1', 'Float"-1.1"'],
		["-123'456.123'45E-9", 'Float"-123456.12345E-9"'],
		['20160204T', YMD],
		['2016-0204T', YMD],
		['2016-02-04T', YMD],
		['201602-04T', YMD],
		['20160204T214901', YMDHMS],
		['20160204TZ', 'Datetime[' + ymd + ',~zone"Z"]'],
		['20160204T-08', 'Datetime[' + ymd + ',~zone"-08"]'],
		['20160204T21:49:01+0802', 'Datetime[' + ymd + hms + ',~zone"+0802"]'],
		['20160204T.123456789Z', 'Datetime[' + ymd + nano + ',~zone"Z"]'],
		[d, D],
	].forEach(want('literal'), t)
})

function use() {
	return ['Use', '+decls', [0, '+body', slice(arguments)]]
}

test('use', function(t) {
	useDecls = [
		["use 'os'   ", use([P, 0, [S, 'path', 'os']])],
		["use 'os' _ ", use([P, 0, [
			[S, 'path', 'os'],
			['Discard', 'name']
		]])],
		["use 'os' os", use([P, 0, [
			[S, 'path', 'os'],
			[I, 'name', 'os']
		]])],
		["use 'ax' ax", use([P, 0, [
			[S, 'path', 'ax'],
			[I, 'name', 'ax']
		]])],
		["use 'os'\nuse 'io'", [
			use([P, 0, [S, 'path', 'os']]),
			use([P, 0, [S, 'path', 'io']])
		]],
		["use\n\t'os'", use([P, 0, [S, 'path', 'os']])],
		["use 'os'\n\t'io'", use(
			aa(P, 0, [S, 'path', 'os']),
			aa(P, 0, [S, 'path', 'io'])
		)],
		["use 'os';;", use(
			aa(P, 0, [S, 'path', 'os']),
			cs(';;')
		)],
		["use 'os';;\n\t'io' _", use(
			aa(P, 0, [S, 'path', 'os']),
			cs(';;'),
			aa(P, 0, [
				[S, 'path', 'io'],
				['Discard', 'name']
			])
		)],
		[
			"use 'os' ;;\n\t'io' _;;",
			use(
				aa(P, 0, [
					[S, 'path', 'os']
				]),
				cs(';;'),
				aa(P, 0, [
					[S, 'path', 'io'],
					['Discard', 'name'],
				]),
				cs(';;')
			)
		],
		[
			code(function() {
				/*
				1
				2
				use 'os' os ;;3
					 3
					'io' _  ;;4
					 4

				5
				 6


				7
				*/
			}),
			aa(
				cs(1, 2),
				use(
					aa(P, 0, [
						[S, 'path', 'os'],
						[I, 'name', 'os'],
					]),
					cs(';;3', ' 3'),
					aa(P, 0, [
						[S, 'path', 'io'],
						['Discard', 'name'],
					]),
					cs(';;4', ' 4')
				),
				cs('', 5, ' 6', '', '', 7)
			)
		],
		["use 'os' os\n\t'io' _\n\t'utf-8' utf-8\n\t'sys'", use(
			aa(P, 0, [
				[S, 'path', 'os'],
				[I, 'name', 'os']
			]),
			aa(P, 0, [
				[S, 'path', 'io'],
				['Discard', 'name']
			]),
			aa(P, 0, [
				[S, 'path', 'utf-8'],
				[I, 'name', 'utf-8']
			]),
			aa(P, 0, [S, 'path', 'sys'])
		)],
		[
			[
				"use 'os'\n\t\t'io'\n\t'sys'",
				"use 'os'\n\t\t'io'\n\t'sys' \n",
			], use(
				aa(P, 0, [S, 'path', 'os']),
				aa(P, 0, [S, 'path', 'io']),
				aa(P, 0, [S, 'path', 'sys'])
			)
		],
		[
			"use 'os'\n\t\t'io'\n\t'sys' \n\n", [
				use(
					aa(P, 0, [S, 'path', 'os']),
					aa(P, 0, [S, 'path', 'io']),
					aa(P, 0, [S, 'path', 'sys'])
				),
				cs('')
			]
		],

	];
	useDecls.forEach(want(null), t)
})


function lets() {
	return ['Let', '+decls', [0, '+body', slice(arguments)]]
}

test('let', function(t) {
	var xyz = lets([AS, 0, [
		aa(0, '+left', aa([I, 0, 'x'], [I, 0, 'y'], [I, 0, 'z'])),
		aa(0, 'op', '='),
		aa(0, '+right', aa([N, 0, 1], [N, 0, 2], [N, 0, 3])),
	]]);
	letDecls = [
		['let x,y,z = 1,2,3', xyz],
		['let\n\tx,\n\ty,z = 1,\n\t2,3', xyz],
		['let x,y,z =\n\t1,2,3', xyz],
		['let\n\tx,y,z = 1,2,3', xyz],
		['let x,\n\ty,z =\n\t1, 2, \n\t3', xyz],
		['let .x = iota', lets([AS, 0, [
			aa(0, '+left', aa([IW, 0, 'x'])),
			aa(0, 'op', '='),
			aa(0, '+right', aa(['Iota'])),
		]])],
		["let -x = 'a','b'", lets([AS, 0, [
			aa(0, '+left', aa([IR, 0, 'x'])),
			aa(0, 'op', '='),
			aa(0, '+right', aa([S, 0, 'a'], [S, 0, 'b'])),
		]])],
		[
			'let x, y,z = 1,2,3\ncomment',
			[
				lets([AS, 0, [
					aa(0, '+left',
						aa([I, 0, 'x'], [I, 0, 'y'], [I, 0, 'z'])),
					aa(0, 'op', '='),
					aa(0, '+right', aa([N, 0, 1], [N, 0, 2], [N, 0, 3])),
				]]),
				cs('comment')
			]
		],
		[
			code(function() {
				/*
				let x,;;
					y,z =
					1,2,3
				*/
			}),
			lets([AS, 0, [
				aa(0, '+left',
					aa([I, 0, 'x'], [Doc, 0, ';;'], [I, 0, 'y'], [I, 0, 'z'])),
				aa(0, 'op', '='),
				aa(0, '+right', aa([N, 0, 1], [N, 0, 2], [N, 0, 3])),
			]])
		],
		[
			code(function() {
				/*
				let x,;;
					 0
					y,z = 1,2,
						3
					 1
					 2
					 3
				*/
			}, function() {
				/*
				let
					x,;;
					 0
					y,z = 1,2,
						3
					 1
					 2
					 3
				*/
			}),
			lets([AS, 0, [
				aa(0, '+left',
					aa([I, 0, 'x'], [Doc, 0, ';;'], [C, 0, ' 0'], [I, 0, 'y'], [I, 0, 'z'])),
				aa(0, 'op', '='),
				aa(0, '+right', aa(
					[N, 0, 1], [N, 0, 2], [N, 0, 3],
					cs(' 1', ' 2', ' 3')
				))
			]])
		],
	];
	letDecls.forEach(want(null), t)
})


function def(name, fields, origin, impls) {
	fields = fields && as(null, '+body', fields.reduce(function(s, field, i) {
			return s + (i && ',' || '') + as('Field', 0, field)
		}, '[')) + ']' || null;

	impls = impls && as(null, '+impls', impls) || null;
	var visit = name[0] == '.' && IW || name[0] == '-' && IR || I;
	if (visit != I)
		name = name.slice(1);
	return 'Def+decls[' + as(visit, 'name', name) +
		(origin && ',' + origin || '') +
		(impls && ',' + impls || '') +
		(fields && ',' + fields || '') +
		']'
}

function chains(first) {
	return [
		[I, 'first', first],
		[0, '+chains', slice(arguments, 1)]
	]
}

function call() {
	return ['Call', 0, [0, '+args', slice(arguments)]]
}

function dot() {
	var a = [];
	slice(arguments).forEach(function(s) {
		this.push(['Dot', 0, [Me, 'member', s]])
	}, a)
	return a;
}

function kv(kt, kv, vt, vv) {
	return aa('KeyValue', 0, aa([kt, 'key', kv], [vt, 'val', vv]))
}

test('def', function(t) {

	defDecls = [
		['def x-y-z', def('x-y-z')],
		['def -x-y-z', def('-x-y-z')],
		['def .x-y-z', def('.x-y-z')],
		['def t utf-8.WS', aa(['Def',
			'+decls', [
				[I, 'name', 't'],
				['Selector', 'origin', [
					[I, 'left', 'utf-8'],
					[I, 'right', 'WS'],
				]]
			]
		])],
		[
			code(function() {
				/*
				def -t;;
					 0
					 1

				1
				*/
			}, function() {
				/*
				def -t;;

					 0

					 1

				1
				*/
			}),
			aa(['Def',
				'+decls', [
					[IR, 'name', 't'],
					[Doc, 0, ';;'],
					[C, 0, ' 0'],
					[C, 0, ' 1'],
				]
			], cs('', '1'))
		],
		[code(function() {
			/*
			def -t
				 0
				 1
				int ;;i
				 i
				string s,;;s
					c
					 2
				 3

			1
			*/
		}), aa(['Def',
			'+decls', [
				[IR, 'name', 't'],
				[Doc, 0, ' 0'],
				[Doc, 0, ' 1'],
				[
					0, '+body', [
						['Field', 0, [I, 'type', 'int']],
						[Doc, 0, ';;i'],
						[C, 0, ' i'],
						['Field', 0, [
							[I, 'type', 'string'],
							[0, '+names', [
								[Me, 0, 's'],
								[Doc, 0, ';;s'],
								[Me, 0, 'c'],
								[Doc, 0, ' 2']
							]],
						]],
						[Doc, 0, ' 3']
					]
				]
			]
		], cs('', '1'))],
		[code(function() {
			/*
			def t
				int
				int8
			*/
		}), def('t', [
			[
				[I, 'type', 'int'],
			],
			[
				[I, 'type', 'int8'],
			]
		])],
		[code(function() {
			/*
			def t
				int age,
					x-i, _
			*/
		}), def('t', [
			[
				[I, 'type', 'int'],
				[0, '+names', [
					[Me, 0, 'age'],
					[Me, 0, 'x-i'],
					['Discard'],
				]],
			],
		])],
	];
	defDecls.forEach(want(null), t)
})

test('expression', function(t) {
	var ij = aa('Chain', 0, chains('i', dot('j'))),
		ijk = aa('Chain', 0, chains('i', dot('j', 'k'))),
		ijck = bin('Chain', //i.j(k,1+1)+2
			chains('i', dot('j'), call([I, 0, 'k'], bin(N, 1, '+'))),
			'+', N, 2);

	expressions = [
		['true', ['Bool', 0, 'true']],
		['1+1', bin(N, 1, '+')],
		['1 + 1', bin(N, 1, '+')],
		['1+ 1', bin(N, 1, '+')],
		['1 +1', bin(N, 1, '+')],
		['1+\n\t1', bin(N, 1, '+')],
		['1+' + d, bin(N, 1, '+', 'Datetime', D.slice(8))],
		['1+' + d + '*2.0',
			bin(N, 1, '+', B, [
				aa('Datetime', 'left', D.slice(8)), op('*'),
				aa(F, 'right', '2.0')
			])
		],
		['x+i++', aa(B, 0, aa(
			aa(I, 'left', 'x'), op('+'),
			aa(Up, 'right', aa(
				aa(I, 'elt', 'i'), op('++')
			))))],
		['~x+i', aa(B, 0, aa(
			aa(U, 'left', aa(
				op('~'), aa(I, 'elt', 'x'))),
			op('+'), aa(I, 'right', 'i')))],
		['~x+i*j', aa(B, 0, aa(
			aa(U, 'left', aa(
				op('~'), aa(I, 'elt', 'x'))),
			op('+'), aa(B, 'right', aa(
				aa(I, 'left', 'i'), op('*'),
				aa(I, 'right', 'j')))))],
		['i*j+-x', aa(B, 0, aa(
			aa(B, 'left', aa(
				aa(I, 'left', 'i'), op('*'),
				as(I, 'right', 'j'))),
			op('+'),
			as(U, 'right', aa(
				op('-'), as(I, 'elt', 'x')))
		))],
		['i.j', ij],
		['i.\n\tj', ij],
		['i.\n\tj.\n\tk', ijk],
		['i.\n\t\tj.\n\t\tk', ijk],

		['i++', ['Update', 0, [
			[I, 'elt', 'i'],
			[0, 'op', '++'],
		]]],
		['++i', ['Update-prefix', 0, [
			[0, 'op', '++'],
			[I, 'elt', 'i'],
		]]],
		['++i--', ['Update', 0, [
			['Update-prefix', 'elt', [
				[0, 'op', '++'],
				[I, 'elt', 'i'],
			]],
			[0, 'op', '--'],
		]]],
		['i.j++', ['Update', 0, [
			['Chain', 'elt', chains('i', dot('j'))],
			[0, 'op', '++'],
		]]],
		['++i.j--', ['Update', 0, [
			['Update-prefix', 'elt', [
				[0, 'op', '++'],
				['Chain', 'elt', chains('i', dot('j'))],
			]],
			[0, 'op', '--'],
		]]],
		['i.j+2', bin('Chain', chains('i', dot('j')), '+', N, 2)],
		['i.j()+2', bin('Chain', chains('i', dot('j'), Call), '+', N, 2)],

		['i.j(k,1+1)+2', ijck],
		['i.j( \n\t\tk,  1+\n\t\t1)+2', ijck],
		['i.j( \n\t\tk,  \n\t\t1+\n\t\t1)+2', ijck],
		['i.j(\n\t\tk, ;;\n\t\t1+\n\t\t1)+2',
			bin('Chain',
				chains('i', dot('j'), call(
					aa(I, 0, 'k'), cs(';;'),
					bin(N, 1, '+'))),
				'+', N, 2)
		],
		['i.j[k][l..1]', aa('Chain', 0, chains('i',
			dot('j'), ['Lookup', 0, [I, 'factor', 'k']], ['Lookup', 0, [
				'Range', 'factor', [
					[I, 'first', 'l'], op('..'), [N, 'last', 1]
				]
			]]
		))],
		['i.j[k][l...1]', aa('Chain', 0, chains('i',
			dot('j'), ['Lookup', 0, [I, 'factor', 'k']], ['Lookup', 0, [
				'Range', 'factor', [
					[I, 'first', 'l'], op('...'), [N, 'last', 1]
				]
			]]
		))],

		['1..2', range(N, '1', '..', N, '2')],
		['1...2', range(N, '1', '...', N, '2')],

		['{}i', ['Composite', 0, ['DictType', 'type', [I, 'spec', 'i']]]],
		['{}i.j', aa('Composite', 0,
			aa('DictType', 'type',
				aa('Selector', 'spec',
					aa([I, 'left', 'i'], [I, 'right', 'j'])
				)
			)
		)],
		['{}i.j{}', aa('Composite', 0, aa(
			aa('DictType', 'type',
				aa('Selector', 'spec',
					aa([I, 'left', 'i'], [I, 'right', 'j'])
				)
			),
			aa('Dict', 'val', aa(0, '+elts', []))
		))],
		[
			[
				'{}i.j{;;\n\t"a" 1,1 "b",null [1,{2 3},{}int]}',
				'{}i.j{;;\n\t\t"a":1,\n\t1:"b",null: [1,{2 3},{}int]}',
			],
			aa('Composite', 0, aa(
				aa('DictType', 'type',
					aa('Selector', 'spec',
						aa([I, 'left', 'i'], [I, 'right', 'j'])
					)
				),
				aa('Dict', 'val', aa(
					aa(0, '+elts', [
						cs(';;'),
						aa('KeyValue', 0, aa(
							[DS, 'key', 'a'], [N, 'val', 1]
						)),
						aa('KeyValue', 0, aa(
							[N, 'key', 1], [DS, 'val', 'b']
						)),
						aa('KeyValue', 0, aa(
							aa('Null', 'key', 'null'),
							aa('List', 'val', [0, '+elts', [
								aa(N, 0, 1),
								aa('Dict', 0, [0, '+elts', [
									['KeyValue', 0,
										aa(
											[N, 'key', 2], [N, 'val', 3]
										)
									]
								]]),
								aa('Composite', 0, [
									aa('DictType', 'type', [
										aa(I, 'spec', 'int')
									])
								])
							]])
						))
					])
				))
			))
		],
	];
	expressions.forEach(want('expressions'), t)
})

function cases() {
	var a = [];
	slice(arguments).forEach(function(a) {
		this.push(['Case', 0, a])
	}, a)
	return [0, '+cases', a]
}

function body() {
	return [0, '+body', slice(arguments)]
}

test('statement', function(t) {
	statements = [
		['out 1,\n\ti', aa('Out', 0, [0, '+elts', [
			[N, 0, '1'],
			[I, 0, 'i'],
		]])],
		['_ = i', ['Assign', 0, [
			[0, '+left', ['Discard']],
			[0, 'op', '='],
			[0, '+right', [I, 0, 'i']]
		]]],
		['_ += i', ['Assign', 0, [
			[0, '+left', ['Discard']],
			[0, 'op', '+='],
			[0, '+right', [I, 0, 'i']]
		]]],
		['self = i', ['Assign', 0, [
			[0, '+left', ['Self', 0, 'self']],
			[0, 'op', '='],
			[0, '+right', [I, 0, 'i']]
		]]],
		[code(function() {
			/*
			if true;
			*/
		}), aa('If', 0, [
			['Bool', 'test', 'true'],
			cases(body())
		])],
		[code(function() {
			/*
			if true; i++
			*/
		}, function() {
			/*
			if true
				i++
			*/
		}), aa('If', 0, [
			['Bool', 'test', 'true'],
			cases(body(['Update', 0, [
				[I, 'elt', 'i'],
				[0, 'op', '++'],
			]]))
		])],
		[code(function() {
			/*
			if true
				i+=1
			*/
		}, function() {
			/*
			if true; i+=1
			*/
		}), aa('If', 0, [
			['Bool', 'test', 'true'],
			cases(body(['Assign', 0, [
				[0, '+left', [I, 0, 'i']],
				[0, 'op', '+='],
				[0, '+right', [N, 0, 1]]
			]]))
		])],
		[code(function() {
			/*
			if v of t
				x = 1
			of i
				i++
				j++
			else
				++k
				l++
			*/
		}, function() {
			/*
			if v of t; x = 1
			of i; i++;
				j++
			else ++k;
				l++
			*/
		}), aa('If', 0, [
			[I, 'test', 'v'],
			cases([
				[0, '+set', [I, 0, 't']],
				body(['Assign', 0, [
					[0, '+left', [I, 0, 'x']],
					[0, 'op', '='],
					[0, '+right', [N, 0, 1]]
				]])
			], [
				[0, '+set', [I, 0, 'i']],
				body(['Update', 0, [
					[I, 'elt', 'i'],
					[0, 'op', '++'],
				]], ['Update', 0, [
					[I, 'elt', 'j'],
					[0, 'op', '++'],
				]])
			]), [0, '+else', aa(['Update-prefix', 0, [
				[0, 'op', '++'],
				[I, 'elt', 'k'],
			]], ['Update', 0, [
				[I, 'elt', 'l'],
				[0, 'op', '++'],
			]])]
		])],
		[code(function() {
			/*
			for true
				i+=1
				l++ ;;
			else
				k++
			*/
		}, function() {
			/*
			for true; i+=1;l++;;
			else k++
			*/
		}), aa('For', 0, [
			['Bool', 'factor', 'true'],
			body(['Assign', 0, [
				[0, '+left', [I, 0, 'i']],
				[0, 'op', '+='],
				[0, '+right', [N, 0, 1]]
			]], ['Update', 0, [
				[I, 'elt', 'l'],
				[0, 'op', '++'],
			]], cs(';;')),
			aa(0, '+else', aa(['Update', 0, [
				[I, 'elt', 'k'],
				[0, 'op', '++'],
			]]))
		])],
	];
	statements.forEach(want('stmts'), t)
})

function genFunc() {
	return statements.map(function(a) {
		var stmt = Array.isArray(a[0]) && a[0][0] || a[0];
		return [
			'fun i()\n\t' + stmt.replace(/\n/gm, '\n\t'),
			aa('Fun', '+decls', [
				[I, 'name', 'i'],
				[0, '+body', a[1]]
			])
		]
	})
}

function func() {
	return aa('Fun', '+decls', slice(arguments))
}

function params() {
	return [0, '+params',
		slice(arguments, 0).map(function(a) {
			return ['Param', 0, a]
		})
	]
}

test('fun decls', function(t) {
	funDecls = [
		['fun i()', func(
			[I, 'name', 'i']
		)],
		['fun -i()', func(
			[IR, 'name', 'i']
		)],
		['fun .i()', func(
			[IW, 'name', 'i']
		)],
		['fun type-name.method-name()', func(
			[I, 'left', 'type-name'], [I, 'name', 'method-name']
		)],
		['fun -t.i()', func(
			[I, 'left', 't'], [IR, 'name', 'i']
		)],
		['fun .t.i()', func(
			[I, 'left', 't'], [IW, 'name', 'i']
		)],
		["fun t'un'(out self)", func(
			[I, 'name', 't'], [0, 'overload', 'un'],
			aa(0, '+results', [
				'Param', 0, [
					['Self', 'type', 'self'],
				]
			])
		)],
		["fun t'++'()", func(
			[I, 'name', 't'], [0, 'overload', '++']
		)],
		["fun t'--'(out self)", func(
			[I, 'name', 't'], [0, 'overload', '--'], [0, '+results', [
				'Param', 0, [
					['Self', 'type', 'self'],
				]
			]]
		)],
		["fun t 'and'(any right; out self)", func(
			[I, 'name', 't'], [0, 'overload', 'and'],
			params([
				[I, 'type', 'any'],
				[0, '+names', [I, 0, 'right']]
			]), [0, '+results', [
				'Param', 0, [
					['Self', 'type', 'self'],
				]
			]]
		)],
		["fun i([]int;{}int;[]{}x.y z, _)", func(
			[I, 'name', 'i'],
			params(
				aa('ListType', 'type', [I, 'spec', 'int']),
				aa('DictType', 'type', [I, 'spec', 'int']),
				aa(
					['ListType', 'type',
						aa('DictType', 'spec', aa('Selector', 'spec',
							aa([I, 'left', 'x'], [I, 'right', 'y'])
						))
					], [
						0, '+names', [
							[I, 0, 'z'], 'Discard'
						]
					]
				)
			)
		)],
		[
			code(function() {
				/*
				fun box.seal(
						int w, ;;width
							h  ;;height
						string label
						out self
					)
					echo 'Sealing...'
					out {}any{'width':w,'height':h,'label':label}
					out
				*/
			}, function() {
				/*
				fun box.seal(
					int w, ;;width
						h  ;;height
					string label
					out self
					)
					echo 'Sealing...'
					out {}any{'width':w,'height':h,
						'label':label
					}
					out
				*/
			}),
			func(
				[I, 'left', 'box'], [I, 'name', 'seal'],
				params([
					[I, 'type', 'int'],
					[0, '+names', aa(
						is('w'), doc(';;width'),
						is('h'), doc(';;height')
					)]
				], [
					[I, 'type', 'string'],
					[0, '+names', is('label')]
				]), [0, '+results', [
					'Param', 0, [
						['Self', 'type', 'self'],
					]
				]],
				body(
					aa('Echo', 0, [0, '+elts', [S, 0, 'Sealing...']]),
					aa('Out', 0, [0, '+elts', aa('Composite', 0, aa(
						aa('DictType', 'type', [I, 'spec', 'any']),
						aa('Dict', 'val', aa(0, '+elts', aa(
							kv(S, 'width', I, 'w'),
							kv(S, 'height', I, 'h'),
							kv(S, 'label', I, 'label')
						)))
					))]),
					aa('Out', 0, [])
				)
			)
		]
	].concat(genFunc());

	funDecls.forEach(want(null), t)
})

test('test case', function(t) {
	for (var i = 0; i < files.length; i++)
		t.errify(actions.parse(fs.readFileSync(files[i]).toString()), files[i])
})