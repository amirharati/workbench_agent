
export const projects = [
  { id: 1, title: 'Knowledge Base', description: 'Personal wiki and resources', stats: { notes: 142, collections: 12 }, icon: 'book' },
  { id: 2, title: 'Workbench Agent', description: 'Design docs and sprint planning', stats: { notes: 24, collections: 4 }, icon: 'cpu' },
  { id: 3, title: 'Recipes & Diet', description: 'Collection of healthy meals', stats: { notes: 85, collections: 8 }, icon: 'coffee' }
];

export const collections = [
  { id: 101, projectId: 1, title: 'C++ References', itemCount: 42 },
  { id: 102, projectId: 1, title: 'Design Patterns', itemCount: 18 },
  { id: 103, projectId: 1, title: 'Machine Learning', itemCount: 156 },
  { id: 104, projectId: 1, title: 'React Ecosystem', itemCount: 33 },
  { id: 105, projectId: 1, title: 'System Design', itemCount: 12 },
  { id: 106, projectId: 1, title: 'DevOps & CI/CD', itemCount: 28 },
  { id: 107, projectId: 1, title: 'Database Optimization', itemCount: 9 },
  { id: 201, projectId: 2, title: 'Sprint 24', itemCount: 7 },
  { id: 202, projectId: 2, title: 'UI Mocks', itemCount: 14 }
];

const loremIpsum = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. 

## Key Points
*   Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.
*   Eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident.
*   Sunt in culpa qui officia deserunt mollit anim id est laborum.

### Detailed Analysis
Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. 

Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur?

> "Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur?"

Code Example:
\`\`\`cpp
#include <iostream>
int main() {
    std::cout << "Hello, World!" << std::endl;
    return 0;
}
\`\`\`
`.repeat(3);

// Helper to generate items
const generateItems = () => {
    let items = [];
    let idCounter = 1000;

    // Hardcoded specific items from before
    items.push(
        { id: idCounter++, projectId: 1, collectionId: 101, type: "note", title: "Memory Model Notes", content: "# Memory Model\n" + loremIpsum, date: "2 days ago" },
        { id: idCounter++, projectId: 1, collectionId: 101, type: "link", title: "cppreference.com - Smart Pointers", date: "1 week ago", url: "https://en.cppreference.com/w/cpp/memory", meta: { domain: "en.cppreference.com", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/ISO_C%2B%2B_Logo.svg/1200px-ISO_C%2B%2B_Logo.svg.png", description: "std::unique_ptr, std::shared_ptr, std::weak_ptr documentation..." } },
        { id: idCounter++, projectId: 1, collectionId: 101, type: "pdf", title: "Effective Modern C++.pdf", date: "1 month ago" }
    );

    // Generate filler items for C++
    for (let i = 0; i < 30; i++) {
        items.push({
            id: idCounter++,
            projectId: 1,
            collectionId: 101,
            type: i % 3 === 0 ? 'note' : (i % 3 === 1 ? 'link' : 'video'),
            title: `C++ Item ${i}: ${['Advanced Templates', 'Move Semantics', 'Lambda Expressions', 'Concurrency', 'Ranges Library'][i % 5]}`,
            content: `# Auto-generated Content ${i}\n\n${loremIpsum}`,
            date: `${Math.floor(Math.random() * 30)} days ago`,
            url: "https://example.com"
        });
    }

    // Generate filler items for Machine Learning
    for (let i = 0; i < 50; i++) {
        items.push({
            id: idCounter++,
            projectId: 1,
            collectionId: 103,
            type: 'note',
            title: `ML Paper Note ${i}: Transformer Architecture`,
            content: `# Attention Is All You Need\n\n${loremIpsum}`,
            date: "Just now"
        });
    }
    
    // Generate filler for "Everything" (Uncategorized)
    for (let i = 0; i < 15; i++) {
        items.push({
             id: idCounter++,
             projectId: 1,
             collectionId: null, // Uncategorized
             type: 'link',
             title: `Random Article ${i}`,
             url: "https://news.ycombinator.com",
             date: "Yesterday",
             meta: { description: "A random link found on the internet."}
        });
    }

    // Items for Project 2 (Workbench Agent) to test Split View
    for (let i = 0; i < 5; i++) {
        items.push({
            id: idCounter++,
            projectId: 2,
            collectionId: 201, // Sprint 24
            type: 'note',
            title: `Workbench Task ${i}`,
            content: `# Workbench Task ${i}\n${loremIpsum}`,
            date: "Today"
        });
    }

    return items;
};

export const items = generateItems();
