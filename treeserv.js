define("treeserv", ["express", "body-parser", "mandu", "treedb", "upfile", "fs", "path"], (express, bodyParser, mandu, treedb, upfile, fs, path) => {
    const router = new express.Router();
    router.use(bodyParser.json());
    router.use(bodyParser.urlencoded({ extended: true }));

    const IMAGE_PATH = process.env.IMAGE_PATH || '/var/treepic/';
    const IMAGE_URL = process.env.IMAGE_URL || '/pic/';
    const upload = new upfile.UploadFolder({path: IMAGE_PATH, urlPath: IMAGE_URL});

    router.get('/trees', async (req, res) => {
        try {
            const { attributes, ...q } = JSON.parse(req.query.q);
            const {result} = await treedb.find(req.query.t || 'allTrees', q);
            res.json(result);
        } catch (err) {
            res.sendStatus(400);
        }
    });
    router.post('/trees', async (req, res) => {
        try {
            const { attributes, ...q } = req.body.q;
            const {result} = await treedb.find(req.query.t || 'allTrees', q);
            res.json(result);
        } catch (err) {
            res.sendStatus(400);
        }
    });
    router.get('/tree', async (req, res) => {
        try {
            const { attributes, ...q } = JSON.parse(req.query.q);
            const {result} = await treedb.findOne(req.query.t || 'allTrees', q);
            res.json(result);
        } catch (err) {
            res.sendStatus(400);
        }
    });
    router.post('/tree', async (req, res) => {
        try {
            const { attributes, ...q } = req.body.q;
            const {result} = await treedb.findOne(req.body.t || 'allTrees', q);
            res.json(result);
        } catch (err) {
            res.sendStatus(400);
        }
    });

    // https://localhost:9001/opendata/trees?&q={%22where%22:{%22property_benefits%22:%220%22,%22dbh%22:{%22$not%22:%220%22}}}

    const picContent = new RegExp(`^!\\[image \\(image\\)\\]\\(${IMAGE_URL}([a-f0-9-]+\.jpg)\\)$`);
    function deleteIfPic({content} = {}) {
        const pic = content && content.match(picContent);
        if ( pic ) {
            fs.rename(path.join(IMAGE_PATH, pic[1]), path.join(IMAGE_PATH, 'deleted', pic[1]), err => err && console.log(err));
        }
    }

    function noattr(q) {
        const { attributes, ...safe } = q;
        return safe;
    }

    router.setupWS = function setupWS() {
        router.ws("/ws", (ws, req) => {
            let session = null;
            let stamp = mandu.batchDelayed(() => session && session.screen.stamp(), 1000*60*10);
            let onproblem = err => {
                if ( session ) {
                    console.log('tree session closing', err);
                    session.close();
                }
            };
            let onsenderror = onproblem;
            ws.on('close', onproblem);
            ws.on('error', onproblem);
            const routes = new mandu.WSRoutes(ws, {onsenderror, routes: {
                find: ({tbl,q}) => stamp() || treedb.find(tbl || 'allTrees', noattr(q)),
                findOne: ({tbl,q}) => stamp() || treedb.find(tbl || 'allTrees', noattr(q)),
                screen: async ({screenId}) => {
                    const newSession = await new treedb.Session(screenId, msg => routes.sendJson(msg)).ready;
                    session && session.close();
                    session = newSession;
                    return {
                        userId: session.user.id,
                        screenId: session.uuid,
                        admin: session.user.admin,
                        active: session.user.active
                    };
                },
                name: ({name}) => {
                    name && session && session.user && session.user.active &&
                        session.user.update({name});
                    return {name: session.user ? session.user.name : name};
                },
                status: ({status}) => {
                    status && session && session.user && session.user.active &&
                        session.user.update({active});
                    return {status: session.user ? session.user.status : status};
                },
                listFavTrees: () => session.user.getAllTrees().then(trees => ({treeIds: trees.map(t => t.id)})),
                listFavSpecies: () => session.user.getSpecies().then(species => ({speciesIds: species.map(s => s.id)})),
                favTree: async ({allTreesId, yesno}) => {
                    const tree = await treedb.db.allTrees.find({where: {id: allTreesId}});
                    if ( yesno ) {
                        session.user.addAllTrees(tree);
                    } else {
                        session.user.removeAllTrees(tree);
                    }
                    stamp();
                },
                favSpecies: async ({speciesId, yesno}) => {
                    const species = await treedb.db.species.find({where: {id: speciesId}});
                    if ( yesno ) {
                        session.user.addSpecies(species);
                    } else {
                        session.user.removeSpecies(species);
                    }
                    stamp();
                },
                findFavTrees: ({q}) => session && session.user && session.user.active && session.user.getAllTrees(q)
                    .then(trees => Promise.all(trees.map(treedb.pickRelevant('allTrees'))))
                    .then(result => ({result})),
                reviseSpecies: ({id, fieldName, value}) => session && session.reviseSpecies({id, fieldName, value}),
                reviseTree: ({id, fieldName, value}) => session && session.reviseTree({id, fieldName, value}),
                postNote: ({allTreesId, content, when}) => session && session.postNote({allTreesId, content, when}),
                flagNote: ({id, flag, when}) => session && session.flagNote({id, flag, when}),
                deleteNote: async ({id}) => {
                    const {result: note} = await treedb.findOne('notes', {where: {id}});
                    deleteIfPic(note);
                    return session && session.deleteNote({id});
                },
                postSpeciesNote: ({speciesId, content, when}) => session && session.postSpeciesNote({speciesId, content, when}),
                flagSpeciesNote: ({id, flag, when}) => session && session.flagSpeciesNote({id, flag, when}),
                deleteSpeciesNote: async ({id}) => {
                    const {result: note} = await treedb.findOne('speciesNotes', {where: {id}});
                    deleteIfPic(note);
                    return session && session.deleteSpeciesNote({id});
                },
                upload: ({name}) => upload.prepare({name}),
                uploadDone: ({id}) => upload.receive(id)
                    
                
                // admin privdb find and edit
                // admin add user
                // find users name,status,pic by id where active
                // list and disown own screen

                // pics

                // find or create user by phone
                //   send conf#, prompt for conf#
                // conf entered
                //   update phone
                //   copy existing user favs
                //   switch user, update screen

                // lower status for unconfirmed (no phone)
                //   name, status, review, report, flag requiring conf to proceed
                
            }});
        });
    };
    
    return router;
});

