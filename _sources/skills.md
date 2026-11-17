# Skills

Claude skills that work with this paper library. A skill is a small set of instructions you add to your claude.ai
account once; after that you call it by name in any chat (web, phone or Desktop).

## /papers: ask questions about the library's papers

Ask a research question and Claude answers it from the papers in the library only: it reads the paper index of the
relevant collection in Google Drive, picks the relevant papers, opens their PDFs and summarizes the evidence with
citations (first author, year, DOI). It uses no web search and no papers from its own knowledge, only the library and
papers you name or upload in the chat.

```{raw} html
<p><a class="pl-edit-topics" href="_static/skills/papers.zip" download>⬇ Download papers.zip</a></p>
```

**Install (once):**

1. Download `papers.zip` above.
2. In claude.ai: **Settings → Capabilities → Skills → Upload skill**, and choose the file. To update it later,
   remove the old *papers* skill and upload the new file.
3. In **Settings → Connectors**, connect **Google Drive** with an account that can see the lab's
   **Paper Library** folder.

**Use:** start a chat with `/papers` and your question, for example:

> /papers I have a question about PRS: how much does prediction accuracy drop across ancestries?

> /papers Fine mapping: how do the methods handle a mismatched LD reference?

Name a collection to focus the search, or leave it out to search all of them. For the strictest version, also turn
**Web search** off in the chat's tools menu, so only Google Drive is on.

**Requires:** a claude.ai account with skills, and read access to the Google Drive folder *Paper Library* (ask the
lab's library admin).
