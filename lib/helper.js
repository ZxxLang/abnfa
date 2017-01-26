"use strict"

function msg(message, text, loc) {
	if (!loc && !text) return message
	return message + ':' + (loc && (loc.line + ':' + loc.col) || '') +
		'\n' + JSON.stringify(text)
}

exports.msg = msg

exports.syntaxError = function syntaxError(message, text, loc) {
	return new SyntaxError(msg(message, text, loc))
}

exports.retrans = function retrans(collector) {
	return collector && (
		typeof collector.retrans == 'function' && collector ||
		typeof collector == 'function' && collector.prototype &&
		typeof collector.prototype.retrans == 'function' &&
		new collector()) || null

}

// exports.isBare = function isBare(o) {
// 	return o != null && Object.getPrototypeOf(o) == null
// }

// function RetransProxy(fn) {
//     this.any = fn
// }

// RetransProxy.prototype.retrans = function retrans(any) {
//     if (any == null) return this.any

//     if (typeof this.any == 'function')
//         this.any = this.any(any)
// }

// exports.proxy = function proxy(fn) {
//     // proxy wrap fn to a retrans object
//     return new RetransProxy(fn)
// }