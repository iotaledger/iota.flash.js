const gulp        = require('gulp');
const eslint      = require('gulp-eslint');
const del         = require('del');
const gulpNSP     = require('gulp-nsp');
const webpack     = require('webpack-stream');

const DEST = './dist/';

// Lint the JS code
gulp.task('lint', [], function(){
    return gulp.src(['**/*.js','!node_modules/**'])
        .pipe(eslint())
        .pipe(eslint.format())
        .pipe(eslint.failAfterError())
});

// Remove existing dist folder
gulp.task('clean', ['lint'], function(cb) {
    del([DEST]).then(cb.bind(null, null));
});

// Check for vulns with nsp
gulp.task('nsp', function (cb) {
  gulpNSP({package: __dirname + '/package.json'}, cb);
});

gulp.task('dist', () => {
  return gulp.src('lib/flash.js')
    .pipe(webpack({
      output: {
        filename: 'iota.flash.js'
      }
    }))
    .pipe(gulp.dest(DEST))
});

gulp.task('default', ['lint', 'clean', 'nsp', 'dist']);
