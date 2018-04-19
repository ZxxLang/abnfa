let
  META = `ABNF-Actions =
    ;1
    to-testing true ;2

    ;3

    ast ( ;4

      ;5
      nodes ARRAY<STRING> ;6

      ;7
    )
    ;8`,

  fs = require('fs'),
  path = require('path'),

  test = require('tape'),
  coder = require('../lib/coder'),
  names = coder.formnames,
  forms = coder.formulas,
  jscoder = require('../lib/js-coder'),
  builder = require('../lib/builder'),
  pattern = require('../lib/patternize');

function read(filename) {
  return fs.readFileSync(
      filename.endsWith('.abnf') && path.join(__dirname, '..', 'grammar' , filename) ||
      path.join(__dirname, 'testdata', filename)
    ).toString();
}

function form(name) {
  return forms[names.indexOf(name)];
}

function Import(code) {
  return Function( // jshint ignore:line
    'module',
    code + ';return module.exports;')({});
}

function be(b, i, src) {
  if (src) {
    b.idx = i;
    return b.data();
  }
  let a = b.record[i];
  return [a[2], a[4]];
}

test('parseAny', function(t) {
  let b  = builder(coder);
  [
    ['quotes-vchar','a', 0],
    ['string','\'1\'', 1, [[1,2]]],
    ['string','\'\'', 1, [[1,1]]],
    ['string','\'\\"\\\'\\x09\\u0000\\u{123456}\'', 1,[[1,25]]],
    ['SP', ' ', 0],
    ['c-wsp', ' ', 0],
    ['strings','\'\' / \'\'', 2, [[1,1],[6,6]]],
    ['field-declare', 'a \'\'', 4],
    ['type-declare', '( a \'1\' )', 6],
    ['rulename','a', 0],
    ['annotation','<a1b-Cd>', 1,[[0,'a1b-Cd']]],
    ['annotation','<a, B>', 2,[[0,'a'],[1,'B']]],
    ['comment',';', 1],
    ['c-nl',';\n',2,[[1,';']]],
    ['action', 'a--b(b,c)', 4],
    ['option', '[a]',3],
    ['option', '[\n a\n ]',3],
    ['group', '("s" to--a(c))',-1],
    ['repeat', '*', 2],
    ['repeat', '1', 2],
    ['repeat', '*2', 2],
    ['repeat', '1*2', 2,[[0,'1'],[1,'2']]],
    ['element', '%x1', 2],
    ['element', '%b1', 2,[[0,'1']]],
    ['element', '\'a\'', 2],
    ['element', '"a"', 3],
    ['defined-as',';\n = ;c\n ',4,[[1,';'],[3,';c']]],
    ['repetition', 'a',2],
    ['concatenation', 'a',2],

  ].forEach((a) => {
    b.init(a[1]);
    t.ok(form(a[0])(b), a[0]);

    if (a[2] !== -1)
      t.equal(b.length, a[2], '  | length');

    if (a[3]) a[3].forEach((a, i) => {
      if (typeof a[1] === 'number')
        t.deepEqual(be(b, i, false), a, '  | record');
      else
        t.equal(be(b, a[0], true), a[1], '  | source');
    });
  });
  t.end();
});

test('refer--pending', function(t) {
  let
    b  = builder(coder),
    s = `ABNF-Actions = to-pending 'testing'

a = '1' 2(%xFF / %b001) b
`;
  b.parse(s);
  t.end();
});

test('Hello World', function(t) {
  let
    b  = builder(coder),
    s = `${META}

;9
source = 1*(
    *SP hello--STRING *SP
    world--STRING ;1
  )

hello  = "hello"
world  = "world"
SP     = ' '
`;

  b.parse(s);
  t.end();
});

test('bootstrap', function(t) {
  let
    src = read('abnfa.abnf'),
    bud = builder(coder),
    g1 = bud.parse(src).build();
  pattern(g1.formnames, g1.formulas);

  let c1 = jscoder(g1);
  bud = builder(Import(c1));

  let g2 = bud.parse(src).build();
  pattern(g2.formnames, g2.formulas);

  let c2 = jscoder(g2);
  bud = builder(Import(c2));

  let g3 = bud.parse(src).build();
  pattern(g3.formnames, g3.formulas);

  let c3 = jscoder(g3);

  t.equal(c2, c3, 'bootstrap');

  t.end();
});

test('JSON', function(t) {
  let
    src = read('json.abnf'),
    bud = builder(coder),
    g1 = bud.parse(src).build(),
    a =   [
    ['Literal', ` "Hi" `, {value:'Hi'}],
    ['Literal Unicode', `"あぁ……ごめん✋\\nトプ画をみて:"`, {value:'あぁ……ごめん✋\nトプ画をみて:'}],
    ['Literal unescape', `"\\n\\t"`, {value:'\n\t'}],
    ['Literal true', `true`, {value: true}],
    ['Literal false', `false`, {value: false}],
    ['Literal null', `null`, {value: null}],
    ['Literal INT', `123`, {value: 123}],
    ['Literal INT', `1E2`, {value: 100}],
    ['Literal INT', `-1E2`, {value: -100}],
    ['Literal FLOAT', `1.23`, {value: 1.23}],
    ['Literal FLOAT', `-1.23E3`, {value: -1230}],
    ['Literal FLOAT', `-1.23e1`, {value: -12.3}],
    ['Object', `{}`, {}],
    ['Object', `{"a" : "Hi"}`, { children: [
        {key:{value: "a"}, value: {value:'Hi'}}
      ]}
    ],
    ['Array',`[]`, {}],
    ['Array',`[1,{ "a":\n[]\n},"\\n",[[]]]`, {children:[
        {value:1},
        {children:[{key:{value: "a"},value:{}}]},
        {value:'\n'},
        {children:[{}]}
      ]}
    ],
  ];

  pattern(g1.formnames, g1.formulas);
  bud = builder(Import(jscoder(g1)));

  a.forEach((a) => {
    bud.parse(a[1]);
    bud.locfield = '';
    bud.typefield = '';
    t.deepEqual(bud.build(), a[2], a[0]);
  });

  t.end();
});

test('JSON parser', function(t) {
  let
    dat = read('twitter.json'),
    src = read('json-parser.abnf'),
    bud = builder(coder),
    g1 = bud.parse(src).build();

  pattern(g1.formnames, g1.formulas);
  bud = builder(Import(jscoder(g1)));

  // Unsafe Integer
  bud.safeInt = function(x){return x;};
  let jsp, fast = Date.now();
  for(let i =0; i<10;i++)
    jsp = JSON.parse(dat);
  fast = Date.now() - fast;

  let jsa, slow = Date.now();
  for(let i =0; i<10;i++)
    jsa = bud.parse(dat).build();
  slow = Date.now() - slow;

  t.deepEqual(jsa, jsp , 'twitter');

  t.pass(`JSON parser is ${slow/fast} times slower then JSON.parse`);
  t.end();
});