import { allTodoistProjectsKeyed } from "./todoist.mjs";
import { Client } from "@notionhq/client";
import {
  allNotionProjectsKeyed,
  WROJECTS_DATABASE_ID,
  PROJECTS_DATABASE_ID,
} from "./notion.mjs";
import got from "got";

const notionClient = new Client({
  auth: process.env.NOTION_TOKEN,
});

const projectsToExclude = [
  "One-offs",
  "Wickler",
  "Someday/Maybe",
  "🎟 Pone-offs",
  "Pickler",
  "🌱 Pomeday/Maybe",
];

projectsToExclude.forEach(
  (excludedProjectName) => delete allTodoistProjectsKeyed[excludedProjectName]
);

const allProjectTitles = new Set();
Object.keys(allNotionProjectsKeyed).forEach((projectTitle) =>
  allProjectTitles.add(projectTitle)
);
Object.keys(allTodoistProjectsKeyed).forEach((projectTitle) =>
  allProjectTitles.add(projectTitle)
);

const masterObject = {};

for (let projectTitle of allProjectTitles) {
  const todoistProject = allTodoistProjectsKeyed[projectTitle];
  const notionProject = allNotionProjectsKeyed[projectTitle];
  // In this case, we simply change the notion project's status to "Complete"
  if (!todoistProject && notionProject) {
    masterObject[projectTitle] = {
      notion: {
        ...allNotionProjectsKeyed[projectTitle],
      },
      todoist: {
        name: projectTitle,
        id: null,
        work: false,
        personal: false,
        status: "Completed",
      },
    };
    // In this case, we need more data.
  } else if (todoistProject && !notionProject) {
    masterObject[projectTitle] = {
      notion: {
        name: projectTitle,
        id: null,
        status: null,
      },
      todoist: {
        name: projectTitle,
        id: todoistProject.id,
        status: "In-progress",
        work: todoistProject.work,
        personal: todoistProject.personal,
      },
    };
  }
  // they're both defined
  else {
    masterObject[projectTitle] = {
      notion: {
        ...allNotionProjectsKeyed[projectTitle],
      },
      todoist: {
        ...allTodoistProjectsKeyed[projectTitle],
        status: "In-progress",
      },
    };
  }
}

async function createNotionChildPage(parentDatabaseId, childTitle, status) {
  return await notionClient.pages.create({
    parent: {
      database_id: parentDatabaseId,
    },
    properties: {
      Name: {
        title: [
          {
            text: {
              content: childTitle,
            },
          },
        ],
      },
      Status: {
        select: {
          name: status,
        },
      },
    },
  });
}

// This does the updating
for (let project in masterObject) {
  const { notion, todoist } = masterObject[project];
  // There's not a page and we should create one
  if (todoist.status === "In-progress" && !notion.status) {
    const databaseIdToUse = todoist.work
      ? WROJECTS_DATABASE_ID
      : PROJECTS_DATABASE_ID;
    const createNotionPageResponse = await createNotionChildPage(
      databaseIdToUse,
      todoist.name,
      "In-progress"
    );

    notionClient.databases.create({
      parent: {
        page_id: createNotionPageResponse.id,
      },
      title: [
        {
          type: "text",
          text: {
            content: "Resources",
            link: null,
          },
        },
      ],
      properties: {
        Name: {
          title: {},
        },
        Description: {
          rich_text: {},
        },
      },
    });

    const nativeURL = createNotionPageResponse.url.replace("https://www.notion.so/", "notion://native/")

    const _ = await got
      .post("https://api.todoist.com/rest/v1/tasks", {
        json: {
          content: `* [Link to Notion project](${nativeURL})`,
          project_id: Number(todoist.id),
        },
        headers: {
          Authorization: `Bearer ${process.env.TODOIST_TOKEN}`,
        },
      })
      .catch((e) => console.log(e));
  } else if (todoist.status === "Completed" && notion.status !== "Completed") {
    notionClient.pages.update({
      page_id: notion.id,
      properties: {
        Status: {
          select: {
            name: "Completed",
          },
        },
      },
    });
  } else if (
    todoist.status === "In-progress" &&
    notion.status !== "In-progress"
  ) {
    notionClient.pages.update({
      page_id: notion.id,
      properties: {
        Status: {
          select: {
            name: "In-progress",
          },
        },
      },
    });
  }
}
