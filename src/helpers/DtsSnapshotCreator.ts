import { extractICSS, IICSSExports } from 'icss-utils';
import * as postcss from 'postcss';
import * as ts_module from 'typescript/lib/tsserverlibrary';
import * as less from 'less';
import * as sass from 'sass';
import * as reserved from 'reserved-words';
import { transformClasses } from './classTransforms';
import { Options } from '../options';
import { Logger } from './logger';

const NOT_CAMELCASE_REGEXP = /[\-_]/;

const classNameToProperty = (className: string) => `'${className}': string;`;
const classNameToNamedExport = (className: string) =>
  `export const ${className}: string;`;

const flattenClassNames = (
  previousValue: string[] = [],
  currentValue: string[],
) => previousValue.concat(currentValue);

export const enum FileTypes {
  css = 'css',
  less = 'less',
  scss = 'scss',
}

export const getFileType = (fileName: string) => {
  if (fileName.endsWith('.css')) return FileTypes.css;
  if (fileName.endsWith('.less')) return FileTypes.less;
  return FileTypes.scss;
};

const getFilePath = (fileName: string) =>
  fileName.substring(0, fileName.lastIndexOf('/'));

export class DtsSnapshotCreator {
  constructor(private readonly logger: Logger) {}

  getClasses(processor: postcss.Processor, css: string, fileName: string) {
    try {
      const fileType = getFileType(fileName);
      let transformedCss = '';

      if (fileType === FileTypes.less) {
        less.render(css, { asyncImport: true } as any, (err, output) => {
          transformedCss = output.css.toString();
        });
      } else if (fileType === FileTypes.scss) {
        const filePath = getFilePath(fileName);
        transformedCss = sass
          .renderSync({
            data: css,
            includePaths: [filePath],
          })
          .css.toString();
      } else {
        transformedCss = css;
      }

      const processedCss = processor.process(transformedCss);

      return processedCss.root
        ? extractICSS(processedCss.root).icssExports
        : {};
    } catch (e) {
      this.logger.error(e);
      return {};
    }
  }

  createExports(classes: IICSSExports, options: Options) {
    const isCamelCase = (className: string) =>
      !NOT_CAMELCASE_REGEXP.test(className);
    const isReservedWord = (className: string) => !reserved.check(className);

    const processedClasses = Object.keys(classes)
      .map(transformClasses(options.camelCase))
      .reduce(flattenClassNames, []);
    const camelCasedKeys = processedClasses
      .filter(isCamelCase)
      .filter(isReservedWord)
      .map(classNameToNamedExport);

    const defaultExport = `\
declare const classes: {
  ${processedClasses.map(classNameToProperty).join('\n  ')}
};
export default classes;
`;

    if (camelCasedKeys.length) {
      return defaultExport + camelCasedKeys.join('\n') + '\n';
    }
    return defaultExport;
  }

  getDtsSnapshot(
    ts: typeof ts_module,
    processor: postcss.Processor,
    fileName: string,
    scriptSnapshot: ts.IScriptSnapshot,
    options: Options,
  ) {
    const css = scriptSnapshot.getText(0, scriptSnapshot.getLength());

    // FIXME: Temporary workaround for https://github.com/mrmckeb/typescript-plugin-css-modules/issues/41
    // Needs investigation for a more elegant solution.
    if (/export default classes/.test(css)) {
      return scriptSnapshot;
    }

    const classes = this.getClasses(processor, css, fileName);
    const dts = this.createExports(classes, options);
    return ts.ScriptSnapshot.fromString(dts);
  }
}
