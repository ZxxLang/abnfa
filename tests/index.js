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
  builder = require('../lib/builder'),
  pattern = require('../lib/patternize');

function read(filename) {
  return fs.readFileSync(
      path.join(__dirname, '..', 'grammar' , filename)
    ).toString();
}

function form(name) {
  return forms[names.indexOf(name)];
}

function Import(code) {
  return Function( // jshint ignore:line
    'exports',
    code + ';return exports;')({});
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
  let b = builder(coder);
  b.parse(read('abnfa.abnf')).build();
  t.end();
});
