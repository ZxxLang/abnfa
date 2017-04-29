"use strict"

function msg(message, text, loc) {
	if (!loc && !text) return message
	return message + ':' + (loc && (loc.line + ':' + loc.col) || '') +
		'\n' + JSON.stringify(text)
}

exports.syntaxError = function syntaxError(message, text, loc, fileName) {
	return new SyntaxError(msg(message, text, loc))
}

exports.retrans = function retrans(collector) {
	return collector && (
		typeof collector.retrans == 'function' && collector ||
		typeof collector == 'function' && collector.prototype &&
		typeof collector.prototype.retrans == 'function' &&
		new collector()) || null
}