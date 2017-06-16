#!/usr/bin/env node

const fs = require("fs"),
	path = require("path"),
	readline = require('readline'),
	core = require('../index');

var err,
	indent,
	grammar = '',
	source = '',
	opts = {},
	serialize = null;

process.stdin.setEncoding('utf8')

main()

function main() {
	var x,
		k,
		v,
		args = process.argv.slice(2);

	for (var i = 0; i < args.length; i++) {

		k = args[i]
		if (k == '-' || k[0] != '-') {
			if (k != '-')
				k = path.normalize(k);

			if (!opts.grammar) {
				opts.grammar = k
				if (k != '-')
					grammar = readFile(k)
			} else if (!opts.source) {
				opts.source = k
				if (k != '-')
					source = readFile(k)
			} else
				return useage(1, 'Unexpected parameter: ' + args[i])

			if (err) return useage(1, err)
			continue
		}

		x = k.indexOf('=');

		v = x != -1 && k.slice(x + 1) || ''
		k = x != -1 && k.substring(0, x) || k

		switch (k) {
			case '-h':
			case '--help':
				return useage()
			case '-v':
			case '--version':
				return version()
			case '-o':
			case '--output':
				v = v || args[++i] || ''
				v = v && path.normalize(v) || v

				opts.output = v

				if (v) {
					if (fs.existsSync(v) && fs.statSync(v).isDirectory())
						serialize = null;
				} else {
					k = path.extname(v) || ''
					serialize = k == '.json' && toJson ||
						k == '.ason' && core.ASON.serialize || null
				}

				break
			case '-i':
			case '--indent':
				indent = '    '
				break
			case '-j':
			case '--json':
				serialize = toJson
				break
			case '-ji':
			case '-ij':
				indent = '    '
				serialize = toJson
				break
			case '-a':
			case '--ason':
				serialize = core.ASON.serialize
				break
			default:
				return version()
		}
	}

	if (!opts.grammar)
		return useage()

	if (opts.grammar == '-')
		return reader('grammar')
			.on('line', function(line) {
				grammar += line + '\n';
			})
			.on('close', function() {
				if (opts.source != '-') return run()
				readSource()
			}).resume();
	else if (opts.source == '-')
		return readSource()

	run()
}

function readSource() {
	return reader('source').on('line', function(line) {
		source += line + '\n';
	}).on('close', function() {
		run()
	}).resume()
}


function run() {
	var results,
		actions,
		rules = grammar && grammar[0] != '{' &&
		core.rules(grammar) || JSON.parse(grammar);

	if (rules instanceof Error) return useage(1, rules.message)

	if (!source) return output(toJson(rules))

	actions = new core.Actions(rules);
	if (actions instanceof Error) return useage(1, actions.message)

	results = actions.parse(source)
	if (results instanceof Error) return useage(1, results.message)

	output((serialize || core.ASON.serialize)(results))

}

function output(data) {
	var file = opts.output;

	if (!file || opts.grammar == '-')
		return console.log(data)

	file = fs.existsSync(file) && fs.statSync(file).isDirectory() &&
		path.join(file, path.basename(
			source && opts.source != '-' && opts.source || opts.grammar
		)) || file

	try {
		fs.writeFileSync(file, data)
	} catch (e) {
		printOpts()
		console.error('\nError:\n\n  %s\n', e.message);
		return
	}
}

function toJson(x) {
	return JSON.stringify(
		Array.isArray(x) && core.ASON.clean(x) || x, null, indent)
}

function version() {
	console.log(require('../package.json').version)
}

function printOpts(nl) {
	if (nl) console.log('')
	console.log('Processing options:\n')
	for (var key in opts)
		console.log('  %s:\t%s', key, opts[key])
}

function useage(exit, msg) {
	console.log(readFile(__dirname + '/usage.txt'))

	if (msg) {
		printOpts()
		console.error('\nError:\n\n  %s\n', msg);
	}

	process.exit(msg && 1 || exit || 0)
}

function readFile(file) {
	try {
		return fs.readFileSync(file, 'utf8')
	} catch (e) {
		err = e.message
	}

	return ''
}

function reader(key) {
	console.log('typing %s and Ctrl+D to EOF', key)

	return readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});
}