const { renderFile } = require("ejs");
const { rm, readFile, writeFile, mkdir, cp, readdir } = require("fs/promises");
const purify = require("dompurify");
const { marked } = require("marked");
const { compileAsync } = require("sass");

const tasks = new (class TaskManager {
    tasks = new Map();
    executedTasks = [];

    register(fn, name = null) {
        name = name || fn.name;
        this.tasks.set(name, { fn, depend: [] });
    }

    depend(name, dep) {
        this.tasks.get(name).depend.push(dep);
    }

    async run(name) {
        if (this.executedTasks.includes(name)) return;
        const task = this.tasks.get(name);
        if (!task) throw Error(`No task found: '${task}'`);
        for (const taskName of task.depend) {
            await this.run(taskName);
        }
        console.log(`:${name}`);
        await task.fn();
    }
})();

// Actual tasks

async function buildPages(root) {
    for (const name of ["index", "qna", "news"]) {
        const string = await renderFile(
            `${__dirname}/template.ejs`,
            {
                require,
                fragment: name,
                ...JSON.parse(await readFile(`${root}/${name}.json`)),
                forward: {
                    __dirname,
                },
            },
            {
                async: true,
            }
        );
        await writeFile(`${__dirname}/build/${name}.html`, string);
    }
}

async function buildNews() {
    await mkdir(`${__dirname}/build/news`, { recursive: true });
    for (const news of await readdir(`${__dirname}/news`).then((a) =>
        a.sort((a, b) => Number(a.split(".")[0]) - Number(b.split(".")[0]))
    )) {
        const string = await renderFile(
            `${__dirname}/template.ejs`,
            {
                require,
                fragment: "display-news",
                title: "placeholder",
                description: "placeholder",
                forward: {
                    html: await marked(await readFile(
                        `${__dirname}/news/${news}`,
                        "utf8"
                    ), { async: true, silent: true, sanitize: true, sanitizer: purify.sanitize }),
                },
            },
            {
                async: true,
            }
        );
        await writeFile(
            `${__dirname}/build/news/${news.replace(/\.md/, ".html")}`,
            string
        );
    }

    {
        const string = await renderFile(
            `${__dirname}/feed.ejs`,
            {
                require,
                __dirname,
            },
            {
                async: true,
            }
        );
        await writeFile(`${__dirname}/build/feed.rss`, string);
    }
}

async function buildCSS(root) {
    await compileAsync(`${__dirname}/style.scss`)
        .then($ => writeFile(`${root}/style.css`, $.css));
    await compileAsync(`${__dirname}/article.scss`)
        .then($ => writeFile(`${root}/article.css`, $.css));
}

async function build() {
    await rm(`${__dirname}/build`, { recursive: true, force: true });
    const root = `${__dirname}/pages`;
    await mkdir(`${__dirname}/build`);

    await Promise.all([
        buildCSS(`${__dirname}/build`),
        buildNews().then(_ => buildPages(root)),
        (async () => {
            await mkdir(`${__dirname}/build/img`);
            await cp(`${__dirname}/img`, `${__dirname}/build/img`, {
                recursive: true,
                force: true,
            });
        })(),
    ]);
}
tasks.register(build);

async function main(taskList) {
    for (const task of taskList) {
        await tasks.run(task);
    }
}
if (require.main == module) main(process.argv.slice(2));
