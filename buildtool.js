const { renderFile } = require("ejs");
const { rm, readFile, writeFile, mkdir, cp, readdir } = require("fs/promises");

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

async function build() {
    await rm(`${__dirname}/build`, { recursive: true, force: true });
    const root = `${__dirname}/pages`;
    await mkdir(`${__dirname}/build`);

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

    await mkdir(`${__dirname}/build/news`);
    for (const news of await readdir(`${__dirname}/news`).then((a) =>
        a.sort((a, b) => Number(a.split(".")[0]) - Number(b.split(".")[0]))
    )) {
        const [title, description, ...paragraphs] = await readFile(
            `${__dirname}/news/${news}`,
            "utf8"
        )
            .then((content) => content.split(/\n{2,}/g))
            .then((a) => a.map((a) => a.trim()).filter((a) => a.length));
        const string = await renderFile(
            `${__dirname}/template.ejs`,
            {
                require,
                fragment: "display-news",
                title,
                description,
                forward: {
                    paragraphs,
                },
            },
            {
                async: true,
            }
        );
        await writeFile(
            `${__dirname}/build/news/${news.replace(/\.txt/, ".html")}`,
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

    await cp(`${__dirname}/style.css`, `${__dirname}/build/style.css`);
    await cp(`${__dirname}/article.css`, `${__dirname}/build/article.css`);
}
tasks.register(build);

async function main(taskList) {
    for (const task of taskList) {
        await tasks.run(task);
    }
}
if (require.main == module) main(process.argv.slice(2));
