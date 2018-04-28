global.define = global.define || ((modName, depNames, init) => Object.assign(exports, init(...depNames.map(require))));

define("treedb", ["lodash", "node-fetch", 'node-uuid', "sequelize"], (_, fetch, uuid, Sequelize) => {
    'use strict';

    const exports = { db: {}, privdb: {} };

    const BATCH = 5;
    const SYNC_BATCH = 40;
    
    const Op = Sequelize.Op;
    const operatorsAliases = {
        $eq: Op.eq,
        $ne: Op.ne,
        $gte: Op.gte,
        $gt: Op.gt,
        $lte: Op.lte,
        $lt: Op.lt,
        $not: Op.not,
        $in: Op.in,
        $notIn: Op.notIn,
        $is: Op.is,
        $like: Op.like,
        $notLike: Op.notLike,
        $iLike: Op.iLike,
        $notILike: Op.notILike,
        $regexp: Op.regexp,
        $notRegexp: Op.notRegexp,
        $iRegexp: Op.iRegexp,
        $notIRegexp: Op.notIRegexp,
        $between: Op.between,
        $notBetween: Op.notBetween,
        $overlap: Op.overlap,
        $contains: Op.contains,
        $contained: Op.contained,
        $adjacent: Op.adjacent,
        $strictLeft: Op.strictLeft,
        $strictRight: Op.strictRight,
        $noExtendRight: Op.noExtendRight,
        $noExtendLeft: Op.noExtendLeft,
        $and: Op.and,
        $or: Op.or,
        $any: Op.any,
        $all: Op.all,
        $values: Op.values,
        $col: Op.col
    };
    
    const sequelize = new Sequelize('trees', 'trees', 'nbknvdsanjoi', {
        host: 'localhost',
        dialect: 'mysql',
        operatorsAliases: false,
        pool: {
            max: BATCH,
            min: 0,
            acquire: 30000,
            idle: 10000
        },
        logging: false,
        operatorsAliases
    });

    sequelize
        .authenticate()
        .then(() => {
            console.log('Connection has been established successfully.');
        })
        .catch(err => {
            console.error('Unable to connect to the database:', err);
        });

    const int = x => x|0;
    const float = x => +x;
    
    const sourceData = {
        api: 'https://data.buffalony.gov/resource/ijxp-q8vx.json?$limit=999999',
        columns: {
            address: {
                type: Sequelize.STRING
            },
            air_quality_benefits: {
                type: Sequelize.STRING
            },
            botanical_name: {
                type: Sequelize.STRING
            },
            co2_avoided_in_lbs: {
                type: Sequelize.STRING
            },
            co2_sequestered_in_lbs: {
                type: Sequelize.STRING
            },
            common_name: {
                type: Sequelize.STRING
            },
            council_district: {
                type: Sequelize.STRING
            },
            dbh: { // diameter at breast height
                type: Sequelize.STRING
            },
            editing: {
                type: Sequelize.STRING
            },
            energy_benefits: {
                type: Sequelize.STRING
            },
            greenhouse_co2_benefits: {
                type: Sequelize.STRING
            },
            kwh_saved: {
                type: Sequelize.STRING
            },
            latitude: {
                type: Sequelize.FLOAT,
            },
            leaf_surface_area_in_sq_ft: {
                type: Sequelize.STRING
            },
            longitude: {
                type: Sequelize.FLOAT,
            },
            park_name: {
                type: Sequelize.STRING
            },
            pollutants_saved_in_lbs: {
                type: Sequelize.STRING
            },
            property_benefits: {
                type: Sequelize.STRING
            },
            side: {
                type: Sequelize.STRING
            },
            site: {
                type: Sequelize.STRING
            },
            site_id: {
                type: Sequelize.STRING(191)
            },
            stormwater_benefits: {
                type: Sequelize.STRING
            },
            stormwater_gallons_saved: {
                type: Sequelize.STRING
            },
            street: {
                type: Sequelize.STRING
            },
            therms_saved: {
                type: Sequelize.STRING
            },
            total_yearly_eco_benefits: {
                type: Sequelize.STRING
            },
            // extra:
            reported_status: {
                type: Sequelize.STRING
            }
        },
        converters: [
            ['latitude', float],
            ['longitude', float]
        ],
        convert(row) {
            for (const [key, convert] of sourceData.converters) {
                if ( row[key] !== undefined ) {
                    row[key] = convert(row[key]);
                }
            }
            return row;
        },
        indexes: [
            {
                unique: true,
                fields: ['site_id']
            },
            {
                method: 'BTREE',
                fields: ['latitude']
            },
            {
                method: 'BTREE',
                fields: ['longitude']
            }
        ],
        id: 'site_id',
        latitude: 'latitude',
        longitude: 'longitude',
        addressNumber: 'address',
        addressStreet: 'street'
    };

    const db = exports.db;
    db.allTrees = sequelize.define("allTrees", Object.assign({}, sourceData.columns, {
        revId: {type: Sequelize.INTEGER}
    }), {
        indexes: sourceData.indexes
    });
    db.species = sequelize.define("species", {
        botanical_name: {
            type: Sequelize.STRING
        },
        common_name: {
            type: Sequelize.STRING
        },
        wikiLink: {
            type: Sequelize.TEXT
        },
        wikiThumb: {
            type: Sequelize.TEXT
        },
        alive: {
            type: Sequelize.BOOLEAN
        },
        edible: {
            type: Sequelize.BOOLEAN
        },
        revId: {
            type: Sequelize.INTEGER
        }
    });
    db.notes = sequelize.define("notes", {
        userId: {
            type: Sequelize.INTEGER
        },
        content: {
            type: Sequelize.TEXT
        },
        when: {
            type: Sequelize.DATE
        },
        flag: {
            type: Sequelize.TEXT
        },
        flagUser: {
            type: Sequelize.INTEGER
        },
        flagWhen: {
            type: Sequelize.DATE
        },
        trailheadId: {
            type: Sequelize.INTEGER
        }
    });
    db.speciesNotes = sequelize.define("speciesNotes", {
        userId: {
            type: Sequelize.INTEGER
        },
        content: {
            type: Sequelize.TEXT
        },
        when: {
            type: Sequelize.DATE
        },
        flag: {
            type: Sequelize.TEXT
        },
        flagUser: {
            type: Sequelize.INTEGER
        },
        flagWhen: {
            type: Sequelize.DATE
        }
    });
    db.relevant = {
        allTrees: ['address', 'dbh', 'leaf_surface_area_in_sq_ft', 'latitude', 'longitude', 'park_name', 'side', 'site', 'site_id', 'street',
                   'id', 'reported_status', 'speciesId', 'revId'],
        species: ['botanical_name', 'common_name', 'wikiLink', 'wikiThumb', 'alive', 'edible', 'id', 'revId'],
        notes: ['id', 'allTreeId', 'userId', 'content', 'when', 'flag', 'flagUser', 'flagWhen', 'trailheadId'],
        speciesNotes: ['id', 'speciesId', 'userId', 'content', 'when', 'flag', 'flagUser', 'flagWhen']
    };
    
    const privdb = Object.assign(exports.privdb, {
        user: sequelize.define("user", {
            name: {
                type: Sequelize.STRING(191)
            },
            phone: {
                type: Sequelize.STRING(191)
            },
            status: {
                type: Sequelize.STRING
            },
            admin: {
                type: Sequelize.BOOLEAN
            },
            active: {
                type: Sequelize.BOOLEAN
            },
            flagged: {
                type: Sequelize.BOOLEAN
            },
            adminReason: {
                type: Sequelize.TEXT
            }
        }, {
            indexes: [
                {
                    fields: ['name']
                },
                {
                    fields: ['phone']
                }
            ]
        }),
        screen: sequelize.define("screen", {
            uuid: {
                type: Sequelize.STRING(36)
            },
            lastSeen: {
                type: Sequelize.DATE
            }
        }, {
            indexes: [
                {
                    fields: ['uuid']
                }
            ]
        }),
        favTree: sequelize.define("favTree", {
            note: { type: Sequelize.STRING, defaultValue: '' }
        }),
        favSpecies: sequelize.define("favSpecies", {
            note: { type: Sequelize.STRING, defaultValue: '' }
        })
    });
    Object.assign(privdb, {
        speciesRev: sequelize.define("speciesRev", {
            when: { type: Sequelize.DATE },
            userId: {
                type: Sequelize.INTEGER,
                references: {
                    model: privdb.user,
                    key: 'id'
                }
            },
            speciesId: {
                type: Sequelize.INTEGER,
                references: {
                    model: db.species,
                    key: 'id'
                }
            },
            fieldName: { type: Sequelize.STRING },
            newValue: { type: Sequelize.STRING },
            oldValue: { type: Sequelize.STRING }
        }),
        allTreesRev: sequelize.define("allTreesRev", {
            when: { type: Sequelize.DATE },
            userId: {
                type: Sequelize.INTEGER,
                references: {
                    model: privdb.user,
                    key: 'id'
                }
            },
            allTreesId: {
                type: Sequelize.INTEGER,
                references: {
                    model: db.allTrees,
                    key: 'id'
                }
            },
            fieldName: { type: Sequelize.STRING },
            newValue: { type: Sequelize.STRING },
            oldValue: { type: Sequelize.STRING }
        })
    });
    Object.assign(db.species.prototype, {
        async revise(userId, fieldName, newValue) {
            const rev = await privdb.speciesRev.create({
                when: new Date(),
                userId,
                speciesId: this.id,
                fieldName,
                newValue,
                oldValue: this[fieldName]
            });
            return this.update({
                [fieldName]: newValue,
                revId: rev.id
            });
        }
    });
    Object.assign(db.allTrees.prototype, {
        async revise(userId, fieldName, newValue) {
            const rev = await privdb.allTreesRev.create({
                when: new Date(),
                userId,
                allTreesId: this.id,
                fieldName,
                newValue,
                oldValue: this[fieldName]
            });
            return this.update({
                [fieldName]: newValue,
                revId: rev.id
            });
        }
    });
    
    Object.assign(privdb.screen.prototype, {
        async ensureUser() {
            if ( ! this.userId ) {
                const user = await privdb.user.create({
                    name: '',
                    phone: '',
                    status: '',
                    admin: false,
                    active: true,
                    flagged: false,
                    adminReason: ''
                });
                this.setUser(user);
                await this.save();
                return user;
            } else {
                return this.getUser();
            }
        },
        async stamp() {
            this.update({lastSeen: new Date()});
        }
    });
    
    db.allTrees.belongsTo(db.species);
    db.species.hasMany(db.allTrees);
    db.notes.belongsTo(db.allTrees);
    db.allTrees.hasMany(db.notes);
    db.speciesNotes.belongsTo(db.species);
    db.species.hasMany(db.speciesNotes);
    db.allTrees.belongsToMany(privdb.user, {through: privdb.favTree});
    privdb.user.belongsToMany(db.allTrees, {through: privdb.favTree})
    db.species.belongsToMany(privdb.user, {through: privdb.favSpecies});
    privdb.user.belongsToMany(db.species, {through: privdb.favSpecies});
    privdb.user.hasMany(privdb.screen);
    privdb.screen.belongsTo(privdb.user);
    
    db.annotate = {
        notes: async note => {
            const user = await privdb.user.findOne({where: {id: note.userId}})
            note.userName = user && user.name || '';
            return note;
        },
        speciesNotes: async note => {
            const user = await privdb.user.findOne({where: {id: note.userId}})
            note.userName = user && user.name || '';
            return note;
        }
    };

    const pickRelevant = exports.pickRelevant = dbName => async r => {
        let out = _.pick(r, db.relevant[dbName]);
        if ( out && db.annotate[dbName] ) {
            out = await db.annotate[dbName](out);
        }
        return out;
    };
    
    exports.sync = async force => {
        const options = force && {force: true};
        await db.species.sync(options);
        await db.allTrees.sync(options);
        await db.notes.sync(options);
        await db.speciesNotes.sync(options);
        await privdb.user.sync(options);
        await privdb.screen.sync(options);
        await privdb.favTree.sync(options);
        await privdb.favSpecies.sync(options);
        await privdb.speciesRev.sync(options);
        await privdb.allTreesRev.sync(options);
        console.log('synced');
    };
    exports.sync()
        .catch(err => console.log('db err',err));

    async function batchMapAsync(lst, actAsync, batch=SYNC_BATCH) {
        for (let i=0; i<lst.length; i += batch) {
            await Promise.all(lst.slice(i, i+batch).map(actAsync));
        }
    }
    
    exports.syncUpstream = async function syncUpstream() {
        const responseObj = await fetch(sourceData.api);
        const response = await responseObj.json();
        if ( response.errorCode ) {
            throw new Error(response.message);
        }
        const id = sourceData.id;
        const columnNames = Object.keys(sourceData.columns);
        await batchMapAsync(response, async rawRow => {
            const row = sourceData.convert(rawRow);
            const [tree, created] = await db.allTrees.findOrCreate({
                where: {[id]: row[id]},
                defaults: row
            });
            let modified = false;
            if ( ! created ) {
                for (const name of columnNames) {
                    const v = row[name];
                    if ( tree[name] !== v ) {
                        tree[name] = v;
                        modified = true;
                    }
                }
            }
            if ( modified ) {
                await tree.save();
            }
        });
    };

    exports.syncSpecies = async function syncSpecies() {
        const botNames = await db.allTrees.findAll({
            attributes: [
                [sequelize.fn('DISTINCT', sequelize.col('botanical_name')), 'botanical_name']
            ],
            where: {
                speciesId: null
            },
            order: [
                ['botanical_name', 'ASC']
            ]
        }).then(data => data.map(({botanical_name}) => botanical_name));
        await batchMapAsync(botNames, async botanical_name => {
            const specimen = await db.allTrees.findOne({where: {botanical_name}});
            const [species, created] = await db.species.findOrCreate({
                where: {botanical_name},
                defaults: {
                    botanical_name,
                    common_name: specimen.common_name,
                    alive: !! specimen.leaf_surface_area_in_sq_ft
                }
            });
            db.allTrees.update({speciesId: species.id}, {
                where: {
                    botanical_name,
                    speciesId: null
                }
            });
        }, BATCH);
    };

    exports.seedWiki = async function seedWiki() {
        const api = `en.wikipedia.org/w/api.php?format=json&callback=?&origin=*&action=query`;
        
        const unJSONP = response => response.text().then(responseText => {
            const match = responseText.match(/\W\W\W\W\((.*)\)/);
            if (! match) throw new Error('invalid JSONP response');
            return JSON.parse(match[1]);
        });
        
        const wikiThumbURL = title => fetch('https://'+api+`&titles=${title}&prop=pageimages&pithumbsize=100`)
          .then(unJSONP)
          .then(({query}) => {
              for (const page of Object.values(query.pages)) {
                  if ( page.thumbnail )
                      return page.thumbnail.source;
              }
          });

        const wikiSearch = s => fetch('https://'+api+'&list=search&srsearch='+encodeURIComponent(s.replace(/['",]/g), '')+'&srlimit=1')
              .then(unJSONP)
              .then(({query}) => query.search[0]);
        
        const unlabeled = await db.species.findAll({where: {wikiLink: null}});
        for (const s of unlabeled) {
            let response = await wikiSearch(`${s.common_name} (${s.botanical_name})`);
            response = response || await wikiSearch(s.botanical_name);
            response = response || await wikiSearch(s.common_name);
            if ( response ) {
                const title = response.title.replace(' ', '_');
                const wikiThumb = await wikiThumbURL(title);
                s.update({
                    wikiLink: 'https://en.wikipedia.org/wiki/'+title,
                    wikiThumb
                });
            }
        }
    };

    const activeSessions = {
        sessions: [],
        add(s) {
            this.sessions.push(s);
        },
        remove(s) {
            this.sessions.splice(this.sessions.indexOf(s), 1);
        },
        broadcast(message) {
            console.log('trees:',JSON.stringify(message));
            this.sessions.forEach(s => s.sendMessage(message));
        }
    };
    
    exports.Session = class Session {
        constructor(screenId, sendMessage) {
            this.uuid = screenId || uuid.v4();
            this.sendMessage = sendMessage || console.log;
            this.screen = {
                uuid: this.uuid,
                lastSeen: new Date()
            };
            screenId = screenId || uuid.v4();
            this.ready = this.initAsync();
        }
        async initAsync() {
            const [record, created] = await privdb.screen.findOrCreate({
                where: {uuid: this.screen.uuid},
                defaults: this.screen
            });
            this.screen = record;
            this.user = await record.ensureUser();
            if ( ! created ) {
                await record.stamp();
            }
            activeSessions.add(this);
            return this;
        }
        close() {
            activeSessions.remove(this);
        }
        async reviseSpecies({id, fieldName, value}) {
            if ( this.user && this.user.active ) {
                const species = await db.species.findOne({where: {id}});
                await species.revise(this.user.id, fieldName, value);
                activeSessions.broadcast({
                    t: 'ev',
                    ev: 'reviseSpecies',
                    id
                });
            }
        }
        async reviseTree({id, fieldName, value}) {
            if ( this.user && this.user.active ) {
                const tree = await db.allTrees.findOne({where: {id}});
                await tree.revise(this.user.id, fieldName, value);
                activeSessions.broadcast({
                    t: 'ev',
                    ev: 'reviseTree',
                    id
                });
            }
        }
        async postNote({allTreesId, content, when}) {
            if ( this.user && this.user.active ) {
                const note = await db.notes.create({
                    userId: this.user.id,
                    content: content || '',
                    when: when || new Date(),
                    flag: ''
                });
                const tree = await db.allTrees.findOne({where: {id: allTreesId}});
                await tree.addNote(note);
                activeSessions.broadcast({
                    t: 'ev',
                    ev: 'postNote',
                    noteId: note.id,
                    allTreesId
                });
                return {note: await pickRelevant('notes')(note)};
            }
        }
        async flagNote({id, flag, when}) {
            const note = await db.notes.findOne({where: {id}});
            if ( note && this.user && this.user.active ) {
                await note.update({
                    flag: flag || '',
                    flagUser: this.user.id,
                    flagWhen: when || new Date()
                });
                activeSessions.broadcast({
                    t: 'ev',
                    ev: 'flagNote',
                    noteId: note.id,
                    allTreesId: note.allTreeId,
                    flag: note.flag,
                    flagUser: note.flagUser,
                    flagWhen: note.flagWhen
                });
                return {note: await pickRelevant('notes')(note)};
            }
        }
        async deleteNote({id}) {
            const note = await db.notes.findOne({where: {id}});
            if ( note && this.user && this.user.active && note.userId === this.user.id ) {
                const tree = await note.getAllTree();
                await tree.removeNote(note);
                activeSessions.broadcast({
                    t: 'ev',
                    ev: 'deleteNote',
                    noteId: note.id,
                    allTreesId: note.allTreeId
                });
                await note.destroy();
            }
        }
        async postSpeciesNote({speciesId, content, when}) {
            if ( this.user && this.user.active ) {
                const note = await db.speciesNotes.create({
                    userId: this.user.id,
                    content: content || '',
                    when: when || new Date(),
                    flag: ''
                });
                const species = await db.species.findOne({where: {id: speciesId}});
                await species.addSpeciesNote(note);
                activeSessions.broadcast({
                    t: 'ev',
                    ev: 'postNote',
                    noteId: note.id,
                    speciesId,
                    general: true
                });
                return {note: await pickRelevant('speciesNotes')(note)};
            }
        }
        async flagSpeciesNote({id, flag, when}) {
            const note = await db.speciesNotes.findOne({where: {id}});
            if ( note && this.user && this.user.active ) {
                await note.update({
                    flag: flag || '',
                    flagUser: this.user.id,
                    flagWhen: when || new Date()
                });
                activeSessions.broadcast({
                    t: 'ev',
                    ev: 'flagNote',
                    noteId: note.id,
                    speciesId: note.speciesId,
                    flag: note.flag,
                    flagUser: note.flagUser,
                    flagWhen: note.flagWhen,
                    general: true
                });
                return {note: await pickRelevant('speciesNotes')(note)};
            }
        }
        async deleteSpeciesNote({id}) {
            const note = await db.speciesNotes.findOne({where: {id}});
            if ( note && this.user && this.user.active && note.userId === this.user.id ) {
                const species = await note.getSpecies();
                await species.removeSpeciesNote(note);
                activeSessions.broadcast({
                    t: 'ev',
                    ev: 'deleteNote',
                    noteId: note.id,
                    speciesId: note.speciesId,
                    general: true
                });
                await note.destroy();
            }
        }
    };

    const dbAct = (dbName, act, def) => {
        const tbl = db[dbName];
        return tbl && act(tbl) || def;
    };
    const packIt = result => ({result});
    exports.find = (dbName, q) => dbAct(dbName, db => db.findAll(q).then(r => Promise.all(r.map(pickRelevant(dbName)))).then(packIt), []);
    exports.findOne = (dbName, q) => dbAct(dbName, db => db.findOne(q).then(pickRelevant(dbName)).then(packIt), null);
    exports.sequelize = sequelize;
    exports.Sequelize = Sequelize;
    
    return exports;
});
