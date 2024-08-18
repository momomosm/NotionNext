import { renderRss2 } from '../../utils/util';

const getUser = async (url) => {
    let res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        }
    });
    let scripts = [];
    let rewriter = new HTMLRewriter()
        .on('script', {
            element(element) {
                scripts.push('');
            },
            text(text) {
                scripts[scripts.length - 1] += text.text;
            },
        })
        .transform(res);
    await rewriter.text();
    let script = scripts.find((script) => script.startsWith('window.__INITIAL_STATE__='));
    script = script.slice('window.__INITIAL_STATE__='.length);
    // replace undefined to null
    script = script.replace(/undefined/g, 'null');
    let state = JSON.parse(script);
    return state.user;
};

const fetchNoteContent = async (noteId) => {
    const noteUrl = `https://www.xiaohongshu.com/discovery/item/${noteId}`;
    let res = await fetch(noteUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        }
    });
    let text = await res.text();
    // Parse content from the response HTML (simple example, may need to adjust based on actual HTML structure)
    const contentMatch = text.match(/<div class="note-content">([\s\S]*?)<\/div>/);
    return contentMatch ? contentMatch[1] : 'No content available';
};

const deal = async (ctx) => {
    const { uid } = ctx.req.param();
    const category = 'notes';
    const url = `https://www.xiaohongshu.com/user/profile/${uid}`;

    const {
        userPageData: { basicInfo, interactions, tags },
        notes,
        collect,
    } = await getUser(url);

    const title = `${basicInfo.nickname} - ${category === 'notes' ? '笔记' : '收藏'} • 小红书 / RED`;
    const description = `${basicInfo.desc} ${tags.map((t) => t.name).join(' ')} ${interactions.map((i) => `${i.count} ${i.name}`).join(' ')}`;
    const image = basicInfo.imageb || basicInfo.images;

    const renderNote = async (notes) => {
        const notesWithContent = await Promise.all(
            notes.flatMap((n) =>
                n.map(async ({ noteCard }) => {
                    const coverUrl = noteCard.cover.infoList.pop().url;
                    const guid = coverUrl.slice(-57); // 生成 guid
                    const content = await fetchNoteContent(noteCard.noteId);

                    return {
                        title: noteCard.displayTitle,
                        link: `${url}/${noteCard.noteId}`,
                        description: `<img src="${coverUrl}"><br>${noteCard.displayTitle}<br>${content}`,
                        author: noteCard.user.nickname,
                        upvotes: noteCard.interactInfo.likedCount,
                        guid: guid, // 添加 guid 字段
                    };
                })
            )
        );
        return notesWithContent.flat();
    };

    const renderCollect = (collect) => {
        if (!collect) {
            throw Error('该用户已设置收藏内容不可见');
        }
        if (collect.code !== 0) {
            throw Error(JSON.stringify(collect));
        }
        if (!collect.data.notes.length) {
            throw ctx.throw(403, '该用户已设置收藏内容不可见');
        }
        return collect.data.notes.map((item) => {
            const coverUrl = item.cover.info_list.pop().url;
            const guid = coverUrl.slice(-57); // 生成 guid

            // Extract content from item (assuming there is a content property)
            const content = item.content || 'No content available';

            return {
                title: item.display_title,
                link: `${url}/${item.note_id}`,
                description: `<img src="${coverUrl}"><br>${item.display_title}<br>${content}`,
                author: item.user.nickname,
                upvotes: item.interact_info.likedCount,
                guid: guid, // 添加 guid 字段
            };
        });
    };

    ctx.header('Content-Type', 'application/xml');
    return ctx.text(
        renderRss2({
            title,
            description,
            image,
            link: url,
            items: category === 'notes' ? await renderNote(notes) : renderCollect(collect),
        })
    );
};

const setup = (route) => {
    route.get('/xiaohongshu/user/:uid', deal);
};

export default { setup };
