
const fs = require('fs')
const spawn = require('child_process').spawn
const through = require('through2')
const temp = require('tempy').file
const wrap = require('browserify-wrap')
function skip (a, b, next) { next() }

module.exports = wasmify

function wasmify (b, options) {
  options = Object.assign({}, options)

  // Add global wasm loader, used by the wasm imports
  b.plugin(wrap, {
    prefix: `\
      function _loadWasmModule (sync, src) {
        var len = src.length
        var trailing = src[len-2] == '=' ? 2 : src[len-1] == '=' ? 1 : 0
        var buf = new Uint8Array((len * 3/4) - trailing)

        var _table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
        var table = new Uint8Array(130)
        for (var c = 0; c < _table.length; c++) table[_table.charCodeAt(c)] = c

        for (var i = 0, b = 0; i < len; i+=4) {
          var second = table[src.charCodeAt(i+1)]
          var third = table[src.charCodeAt(i+2)]
          buf[b++] = (table[src.charCodeAt(i)] << 2) | (second >> 4)
          buf[b++] = ((second & 15) << 4) | (third >> 2)
          buf[b++] = ((third & 3) << 6) | (table[src.charCodeAt(i+3)] & 63)
        }

        return sync ? new WebAssembly.Module(buf) : WebAssembly.compile(buf)
      }
    `.trim()
  })

  // Transform wasm or source files
  b.transform(function (id, opts) {
    if (!opts) opts = {}

    const syncFiles = opts.sync ? opts.sync.map(path.resolve) : []

    if (!/\.wasm$/.test(id)) {
      return through()
    } else {
      return through(skip, function write () {
        fs.readFile(id, (err, code) => {
          if (err) return this.emit('error', err)
          const sync = syncFiles.indexOf(id) !== -1
          const wasm = code.toString('base64')
          this.push(`module.exports=_loadWasmModule(${sync}, '${wasm}')`)
          this.push(null)
        })
      })
    }
  })

  return b
}
