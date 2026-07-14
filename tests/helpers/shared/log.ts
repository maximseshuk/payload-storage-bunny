import chalk from 'chalk'

export const log = {
  blank: () => console.log(''),
  divider: (char = '─') => console.log(chalk.dim(char.repeat(50))),
  error: (msg: string) => console.error(chalk.red(`✗ ${msg}`)),
  header: (title: string) => {
    console.log('')
    console.log(chalk.dim('═'.repeat(50)))
    console.log(chalk.bold(` ${title}`))
    console.log(chalk.dim('═'.repeat(50)))
  },
  info: (msg: string) => console.log(chalk.gray(`  ${msg}`)),
  ready: (msg: string) => console.log(chalk.bgGreen.black(' READY ') + ' ' + chalk.green(msg)),
  success: (msg: string) => console.log(chalk.green(`✓ ${msg}`)),
  warn: (msg: string) => console.log(chalk.yellow(`⚠ ${msg}`)),
}
