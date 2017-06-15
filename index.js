'use strict';
var core = require('./lib/core')

exports.ASON = require('./lib/ason')
exports.Trans = core.Trans
exports.Rules = core.Rules
exports.Retrans = core.Retrans
exports.Entries = core.Entries
exports.Actions = core.Actions
exports.tokenize = core.tokenize

exports.rules = function rules(grammar) {
	return core.tokenize(grammar, core.Entries, core.Rules)
}