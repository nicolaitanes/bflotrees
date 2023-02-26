define("main", ["domReady!", "mandelicu", "d3", "showdown"], (doc, mandelicu, d3, showdown) => {
    'use strict';

    const state = new mandelicu.LocalState('trees', {
        trees: {v: [], type: 'o'},
        species: {v: [], type: 'o'},
        speciesId: {v: 0, type: 'i'},
        speciesFavs: {v: [], type: 'o'},
        speciesRev: {v: -1, type: 'i'},
        treeFavs: {v: [], type: 'o'},
        lat0: {v: 42.886, range: [-90, 90]},
        long0: {v: -78.8780705, range: [-180, 180]},
        lat1: {v: 42.8864119, range: [-90, 90]},
        long1: {v: -78.87, range: [-180, 180]},
        screenId: {v: '', type: 's'},
        name: {v: '', type: 's'},
        introShow: {v:'auto', type:'s'},
        introScreen: {v:12}
    });

    const apis = {
        trees: `ws${document.location.origin.substring(4)}/opendata/ws`,
        source: 'https://data.buffalony.gov/resource/ijxp-q8vx.json',
        openStreetMap: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        openStreetMapAttr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    };
    
    const api = {
        userId: -1,
        ev: mandelicu.makeEvents(['reviseSpecies', 'reviseTree', 'postNote', 'flagNote', 'deleteNote']),
        ws: mandelicu.wsAuth(apis.trees, {
            immediate: true,
            requestAuth(ws) {
                return ws.request({
                    t: 'screen',
                    screenId: state.screenId()
                });
            },
            onauth(response) {
                state.screenId(response.screenId);
                api.userId = response.userId;
                return api._updateFavs();
            },
            onmessage(event, msg) {
                if ( msg.t === 'ev' ) {
                    const ev = api.ev[msg.ev];
                    ev ? ev.trigger(msg) : console.log(msg);
                }
            }
        }),
        async _updateFavs() {
            if ( ! state.speciesFavs().length ) { // need server-side test if multiple screens per user
                const {speciesIds} = await this.ws.request({t: 'listFavSpecies'});
                state.speciesFavs(speciesIds);
            }
            if ( ! state.treeFavs().length ) {
                const {treeIds} = await this.ws.request({t: 'listFavTrees'});
                state.treeFavs(treeIds);
            }
        },
        async name(name) {
            const {retname} = await this.ws.request({t: 'name', name});
            return retname;
        },
        async status(status) {
            const {retstatus} = await this.ws.request({t: 'status', status });
            return retstatus;
        },
        async query(tbl, q={}, justOne=false) {
            const response = await this.ws.request({
                t: justOne ? 'findOne' : 'find',
                tbl, q
            });
            return response.result;
        },
        buildGeoquery: (lat0, long0, lat1, long1) => ({
            where: {
                latitude: {$between: [lat0, lat1]},
                longitude: {$between: [long0, long1]}
            }
        }),
        treesIn(lat0, long0, lat1, long1, {speciesId, limit=666}={}) {
            const q = this.buildGeoquery(lat0, long0, lat1, long1);
            if ( speciesId ) {
                q.where.speciesId = speciesId;
            }
            if ( limit ) {
                q.limit = limit;
            }
            return this.query('allTrees', q);
        },
        favSpecies(speciesId, yesno) {
            return this.ws.request({
                t: 'favSpecies',
                speciesId, yesno
            });
        },
        favTree(allTreesId, yesno) {
            return this.ws.request({
                t: 'favTree',
                allTreesId, yesno
            });
        },
        async findFavTrees(q) {
            const {result} = await this.ws.request({t: 'findFavTrees', q});
            return result;
        },
        favTreesIn(lat0, long0, lat1, long1) {
            return this.findFavTrees(this.buildGeoquery(lat0, long0, lat1, long1));
        },
        reviseSpecies(id, fieldName, value) {
            return this.ws.request({
                t: 'reviseSpecies',
                id, fieldName, value
            });
        },
        reviseTree(id, fieldName, value) {
            return this.ws.request({
                t: 'reviseTree',
                id, fieldName, value
            });
        },
        async postNote(allTreesId, content) {
            const {note} = await this.ws.request({
                t: 'postNote',
                allTreesId, content,
                when: new Date()
            });
            return note;
        },
        flagNote(id, flag) {
            return this.ws.request({
                t: 'flagNote',
                id, flag,
                when: new Date()
            });
        },
        deleteNote(id) {
            return this.ws.request({
                t: 'deleteNote',
                id
            });
        },
        listNotes(allTreeId, order) {
            return this.query('notes', {
                where: {allTreeId},
                order: [ order || ['when', 'ASC'] ]
            });
        },
        async postSpeciesNote(speciesId, content) {
            const {note} = await this.ws.request({
                t: 'postSpeciesNote',
                speciesId, content,
                when: new Date()
            });
            return note;
        },
        flagSpeciesNote(id, flag) {
            return this.ws.request({
                t: 'flagSpeciesNote',
                id, flag,
                when: new Date()
            });
        },
        deleteSpeciesNote(id) {
            return this.ws.request({
                t: 'deleteSpeciesNote',
                id
            });
        },
        listSpeciesNotes(speciesId, order) {
            return this.query('speciesNotes', {
                where: {speciesId},
                order: [ order || ['when', 'ASC'] ]
            });
        },
        async upload(blob, name) {
            const {id, url} = await this.ws.request({
                t: 'upload',
                name
            });
            const body = new FormData();
            body.append('file', blob);
            fetch('/up/'+id, {
                method: 'POST',
                body
            });
            await this.ws.request({
                t: 'uploadDone',
                id
            });
            return url;
        }
    };

    const species = {
        ID_ALL: 0,
        ID_FAV: -1,
        mnu: d3.select('#l3type'),
        btnFav: d3.select('#l3typefav'),
        ev: mandelicu.makeEvents(['update']),
        favs: mandelicu.StateBackedSet(state, 'speciesFavs', {
            onchange: () => species._populateMnu(),
            onadd: v => api.favSpecies(v, true),
            ondelete: v => api.favSpecies(v, false)
        }),
        _populateMnu() {
            const species = state.species();
            const speciesAlpha = (a,b) => a.common_name.localeCompare(b.common_name);
            const favs = [...this.favs.value]
                  .map(speciesId => species[speciesId])
                  .sort(speciesAlpha);
            const speciesActive = species.filter(s => s && s.common_name)
                  .sort(speciesAlpha);
            const favSel = this.mnu.select('#l3typefavs')
                  .selectAll('option')
                  .data(favs, d => d.id);
            favSel.exit().remove();
            favSel.enter().insert('option')
                .property('value', d => d.id)
                .text(d => '\u{1f4cc} '+d.common_name);
            const sel = this.mnu.select('#l3typeall')
                  .selectAll('option')
                  .data(speciesActive, d => d.id);
            sel.exit().remove();
            sel.enter().insert('option')
                .property('value', d => d.id)
                .text(d => d.common_name);
            this._select();
        },
        _select() {
            const t = state.speciesId();
            this.mnu.node().value = t;
            this.btnFav
                .style('display', (t>0) ? '' : 'none')
                .classed('l3fav', this.favs.value.has(t));
        },
        async _update() {
            try {
                const byId = state.species();
                const maxId = byId.length - 1;
                const [revised, novel] = await Promise.all([
                    api.query('species', {where: {revId: {$gt: state.speciesRev()}}}),
                    api.query('species', {where: {id: {$gt: maxId}}})
                ]);
                const results = revised.concat(novel);
                let rev = state.speciesRev();
                for (const item of results) {
                    byId[item.id] = item;
                    rev = Math.max(rev, item.revId);
                }
                if ( results.length ) {
                    console.log('species updated to rev',rev);
                    state.speciesRev(rev);
                    this.ev.update.trigger(results);
                    state.ev.species.trigger(byId);
                    state.changed();
                }
            } catch (err) {
                console.log(err);
            }
        },
        init() {
            this.populateMnu = mandelicu.batchDelayed(() => this._populateMnu(), 333);
            this.update = mandelicu.batchDelayed(() => this._update(), 30*1000);
            api.ev.reviseSpecies.sub(this.update);
            state.ev.species.sub(mandelicu.batchDelayed(this.populateMnu, 1000));
            state.ev.speciesId.sub(t => this._select());
            this.mnu.on('change', () => state.speciesId(this.mnu.node().value|0));
            this.btnFav.on('click', () => {
                const t = state.speciesId();
                const b = ! this.favs.value.has(t);
                if ( b ) {
                    this.favs.add(t);
                } else {
                    this.favs.delete(t);
                }
                this.btnFav.classed('l3fav', b);
                this.populateMnu();
            });

            this.populateMnu();
            this._update();
            return this;
        }
    }.init();

    state.ev.name.sub(name => api.name(name));
    api.name().then(state.name);

    const dlgConfirm = new mandelicu.Modal({content: document.getElementById('l3confirm')});
    const confirm = q => {
        dlgConfirm.dom.content.querySelector('#l3confirmmsg').innerHTML = q || 'Are you sure?';
        return dlgConfirm.run();
    };

    const dlgRevise = new mandelicu.Modal({ content: document.querySelector('#l3revise') });
    const revise = async (method, item, fieldName, originalValue) => {
        if ( originalValue === undefined ) {
            originalValue = item[fieldName];
        }
        const dotdot = mandelicu.querydotdot(dlgRevise.dom.content);
        dotdot('#l3revfield', txt => { txt.textContent = fieldName; });
        const txtValue = dotdot('#l3revval', txt => { txt.value = item[fieldName] });
        const txtName = dotdot('#l3revname', txt => { txt.value = state.name(); });
        setTimeout(() => (txtName.value ? txtValue : txtName).focus(), 100);
        await dlgRevise.run();
        const v = txtValue.value;
        if ( v === originalValue ) {
            return v;
        }
        item[fieldName] = v;
        if ( ! txtName.value ) {
            return await revise(method, item, fieldName, originalValue);
        }
        state.name(txtName.value);
        await api[method](item.id, fieldName, v);
        return v;
    };
    const reviseSpecies = (species, fieldName) => revise('reviseSpecies', species, fieldName);
    const reviseTree = (tree, fieldName) => revise('reviseTree', tree, fieldName);

    const formatNoteDate = date => ''+new Date(date).toLocaleString();
    const downMarker = new showdown.Converter({
        strikethrough: true,
        simpleLineBreaks: true,
        simplifiedAutoLink: true,
        excludeTrailingPunctuationFromURLs: true
    });
    
    const notesDlg = {
        Edit: new mandelicu.Modal({
            content: document.getElementById('l3noteedit'),
            okLabel: 'Next',
            buttons: [ ['Help...', () => notesDlg.Help.run()] ]
        }),
        Help: new mandelicu.Modal({
            content: document.getElementById('l3notehelp'),
            canCancel: false,
            okLabel: 'Close'
        }),
        Review: new mandelicu.Modal({
            content: document.getElementById('l3notereview'),
            okLabel: 'Post',
            buttons: [ ['Edit', () => {
                notesDlg.Review.resolve(false); // not ready
            }] ]
        }),
        ReviewPic: new mandelicu.Modal({
            content: document.getElementById('l3picreview'),
            okLabel: 'Post'
        }),
        Flag: new mandelicu.Modal({
            content: document.getElementById('l3noteflag'),
            okLabel: 'Flag It!',
            cancelLabel: 'Never Mind'
        }),
        FlagReview: new mandelicu.Modal({
            content: document.getElementById('l3noteflagreview'),
            cancelLabel: 'Un-Flag'
        }),
        viewTemplate: mandelicu.querydotdot('.l3detailnote').toFragment()
    };

    const opener = new mandelicu.Opener();

    class Notes {
        constructor({selector='#l3detailnotes', general=false}={}) {
            this.general = !! general;
            this.table = general ? 'speciesNotes' : 'notes';
            this.idName = general ? 'speciesId' : 'allTreesId';
            this.divNotes = d3.select(selector);
            this.data = [];
            const editNodes = mandelicu.querydotdot(notesDlg.Edit.dom.content);
            this.editText = editNodes('textarea');
            this.editName = editNodes('.l3detaildlgname');
            const reviewNodes = mandelicu.querydotdot(notesDlg.Review.dom.content);
            this.reviewText = reviewNodes('#l3noterevtext');
            this.reviewName = reviewNodes('.l3detaildlgname');
            const revPicNodes = mandelicu.querydotdot(notesDlg.ReviewPic.dom.content);
            this.revPicImg = revPicNodes('#l3picrevpic', node => new mandelicu.LaunderedImgCanvas({node, maxWidth: 1024}));
            this.revPicName = revPicNodes('.l3detaildlgname');
            this.revPicRotCCW = revPicNodes.listen('#l3picrevccw', 'click', () => {this.revPicImg.rotation = (this.revPicImg.rotation + 1)%4;});
            this.revPicRotCW = revPicNodes.listen('#l3picrevcw', 'click', () => {this.revPicImg.rotation = (this.revPicImg.rotation - 1)%4;});
            const flagNodes = mandelicu.querydotdot(notesDlg.Flag.dom.content);
            this.flagText = flagNodes('textarea');
            this.flagName = flagNodes('.l3detaildlgname');
            const flagReviewNodes = mandelicu.querydotdot(notesDlg.FlagReview.dom.content);
            this.flagReviewWhy = flagReviewNodes('#l3noteflagwhy');
            this.flagReviewWhat = flagReviewNodes('#l3noteflagwhat');
            this.flagReviewName = flagReviewNodes('.l3detaildlgname');
            api.ev.postNote.sub(async msg => {
                if ( msg.general === this.general && msg[this.idName] === this[this.idName] ) {
                    const [note] = await api.query(this.table, {where: {id: msg.noteId}}, true);
                    if ( msg.userId !== api.userId ) {
                        this.data.push(note);
                        this.render(this.data);
                    }
                }
            });
            api.ev.flagNote.sub(msg => {
                if ( msg.general === this.general && msg[this.idName] === this[this.idName] ) {
                    this.render(this.data.map(d => {
                        if ( d.id === msg.noteId ) {
                            d.flag = msg.flag;
                            d.flagUser = msg.flagUser;
                            d.flagWhen = msg.flagWhen;
                        }
                        return d;
                    }));
                }
            });
            api.ev.deleteNote.sub(msg => {
                if ( msg.general === this.general && msg[this.idName] === this[this.idName] ) {
                    this.render(this.data.filter(d => d.id !== msg.noteId));
                }
            });
            notesDlg.Help.dom.content.innerHTML = downMarker.makeHtml(notesDlg.Help.dom.content.innerHTML.trim());
            return this;
        }
        render(data=[]) {
            this.data = data;
            const self = this;
            const template = notesDlg.viewTemplate;
            const sel = this.divNotes.selectAll('.l3detailnote').data(data, d => d.id);
            sel.exit().remove();
            sel.enter().append('div').each(function(d) {
                const nodes = template.attachedTo(this);
                Object.assign(d, {
                    nodes,
                    hdr: nodes('.l3dnhdr'),
                    txtName: nodes('.l3dnname', div => { div.textContent = d.userName; }),
                    txtWhen: nodes('.l3dnwhen', div => { div.textContent = formatNoteDate(d.when); }),
                    btnFlag: nodes.listen('.l3dnaddflag', 'click', async () => {
                        d.flag = await self.flag(d.id);
                        self.render(self.data);
                    }),
                    btnReviewFlag: nodes.listen('.l3dnreviewflag', 'click', async () => {
                        d.flag = await self.reviewFlag(d.id, d.content, d.flag);
                        self.render(self.data);
                    }),
                    btnDelete: nodes.listen('.l3dndelete', 'click', async () => {
                        await confirm('Permanently delete this note?');
                        await self.delete(d.id);
                        self.render(self.data.filter(x => x.id !== d.id));
                    }),
                    txtContent: nodes('.l3dncontent', div => { div.innerHTML = downMarker.makeHtml(d.content); }),
                });
            }).classed('l3detailnote', true);
            sel.each(d => {
                const mine = d.userId === api.userId;
                if ( d.flag ) d.hdr.classList.add('l3dnflagged');
                else          d.hdr.classList.remove('l3dnflagged');
                d.txtContent.style.display = (! d.flag) ? '' : 'none';
                if ( mine ) {
                    d.btnFlag.style.display = d.flag ? '' : 'none';
                    d.btnFlag.title = d.flag;
                } else {
                    d.btnFlag.style.display = d.flag ? 'none' : '';
                    d.btnFlag.title = 'Flag this note as inappropriate...';
                }
                d.btnFlag.disabled = mine;
                d.btnReviewFlag.style.display = ((! mine) && d.flag) ? '' : 'none';
                d.btnReviewFlag.title = 'Flagged because: '+d.flag;
                d.btnDelete.style.display = mine ? '' : 'none';
            });
        }
        async _edit(content) {
            this.editText.value = content || '';
            this.editName.value = state.name();
            setTimeout(() => (this.editName.value ? this.editText : this.editName).focus(), 100);
            await notesDlg.Edit.run();
            state.name(this.editName.value);
            return this.editText.value;
        }
        async _review(content, sameContent) {
            if ( ! sameContent ) {
                this.reviewText.innerHTML = downMarker.makeHtml(content || '');
                this.reviewName.value = state.name();
            }
            this.wantEdit = false;
            const ready = await notesDlg.Review.run();
            if ( ready ) {
                if ( ! this.reviewName.value ) {
                    /// turn it red?
                    return this._review(null, true);
                }
                state.name(this.reviewName.value);
            }
            return ready;
        }
        async post(id, content) {
            let ready;
            while ( ! content ) {
                content = await this._edit(content);
            }
            ready = await this._review(content);
            return ready ? (this.general ? api.postSpeciesNote(id, content) :  api.postNote(id, content))
                : this.post(id, content);
        }
        async _reviewPic(id, file) {
            this.revPicImg.src = file;
            try {
                this.revPicName.value = state.name();
                await notesDlg.ReviewPic.run();
                state.name(this.revPicName.value);
                const blob = await this.revPicImg.toBlob('image/jpeg');
                const url = await api.upload(blob, 'image.jpg');
                const content = `![image (image)](${url})`;
                return this.general ? api.postSpeciesNote(id, content) : api.postNote(id, content);
            } finally {
                this.revPicImg.src = '';
                opener.reset();
            }
        }
        async snap(id) {
            const [file] = await opener.choose('image/*');
            return this._reviewPic(id, file);
        }
        async flag(id, sameContent) {
            if ( ! sameContent ) {
                this.flagText.value = '';
                this.flagName.value = state.name();
            }
            try {
                setTimeout(() => (this.flagName.value ? this.flagText : this.flagName).focus(), 100);
                await notesDlg.Flag.run();
            } catch (err) {
                if ( err === 'Canceled' ) return ''; // Never Mind
            }
            const flag = this.flagText.value;
            if ( flag ) {
                if ( ! this.flagName.value ) {
                    /// turn it red?
                    return this.flag(id, true);
                }
                state.name(this.flagName.value);
                await (this.general ? api.flagSpeciesNote(id, flag) : api.flagNote(id, flag));
            }
            return flag;
        }
        async reviewFlag(id, content, flag, sameContent) {
            if ( ! sameContent ) {
                this.flagReviewWhy.textContent = flag || '';
                this.flagReviewWhat.innerHTML = downMarker.makeHtml(content || '');
                this.flagReviewName.value = state.name();
            }
            try {
                await notesDlg.FlagReview.run();
            } catch (err) {
                if ( err === 'Canceled' ) { // Un-Flag
                    if ( ! this.flagReviewName.value ) {
                        /// turn it red?
                        return this.reviewFlag(id, null, null, true);
                    }
                    state.name(this.flagReviewName.value);
                    await (this.general ? api.flagSpeciesNote(id, '') : api.flagNote(id, ''));
                    return '';
                }
            }
            state.name(this.flagReviewName.value);
            return flag;
        }
        async delete(id) {
            await (this.general ? api.deleteSpeciesNote(id) : api.deleteNote(id));
        }
    }

    const notes = new Notes();
    const genNotes = new Notes({
        selector: '#l3detailgennotes',
        general: true
    });
    
    let updatePin = x => undefined;
    const treeFavs = mandelicu.StateBackedSet(state, 'treeFavs', {
        onchange: v => updatePin(v),
        onadd: v => api.favTree(v, true),
        ondelete: v => api.favTree(v, false)
    });

    const detail = {
        tree: null,
        panel: d3.select('#l3detail'),
        hidePanel: d3.select('#l3maps'),
        wikiLink: d3.select('#l3detailwiki').node(),
        active: false,
        show(t, reshowing) {
            reshowing || window.history.pushState({id: t.id}, '', '#'+t.id);
            this.tree = t;
            this.active = true;
            const s = state.species()[t.speciesId];
            this.species = s;
            this.wikiLink.href = this.species.wikiLink;
            this.panel.selectAll('.l3field').each(function() {
                const isSpecies = this.dataset.entity === 'species';
                d3.select(this).datum({
                    node: this,
                    item: isSpecies ? s : t,
                    rev:  isSpecies ? reviseSpecies : reviseTree,
                    fieldName: this.dataset.field,
                    targetAttr: this.dataset.targetAttr || 'textContent'
                });
            }).each(d => {
                d.node[d.targetAttr] = d.item[d.node.dataset.field] ||
                    ([/*'src', */'href'].includes(d.targetAttr) ? '' : '(blank)');
                // keeping invalid img src="(blank)" so it's onscreen selectable
            });
            notes.allTreesId = t.id;
            genNotes.speciesId = s.id;
            notes.render();
            genNotes.render();
            api.listNotes(t.id).then(results => notes.render(results));
            api.listSpeciesNotes(s.id).then(results => genNotes.render(results));
            this.panel.select('#l3detailaddnote').on('click', () => notes.post(t.id).then(note => notes.render(notes.data.concat([note]))));
            this.panel.select('#l3detailaddgennote').on('click', () => genNotes.post(s.id).then(note => genNotes.render(genNotes.data.concat([note]))));
            this.panel.select('#l3detailaddpic').on('click', () => notes.snap(t.id).then(note => notes.render(notes.data.concat([note]))));
            this.panel.select('#l3detailaddgenpic').on('click', () => genNotes.snap(s.id).then(note => genNotes.render(genNotes.data.concat([note]))));
            this.hidePanel.style('opacity', 0.01);
            setTimeout(() => {
                this.hidePanel.style('display', 'none');
                this.panel.style('display', '');
            }, 500);
        },
        hide() {
            if ( history.state && history.state.id ) {
                history.go(-1);
            } else {
                this.active = false;
                notes.allTreesId = 0;
                genNotes.speciesId = 0;
                history.replaceState({}, '', '#');
                this.panel.style('display', 'none');
                this.hidePanel.style('display', '');
                setTimeout(() => this.hidePanel.style('opacity', 1.0), 100);
            }
        },
        init() {
            window.addEventListener('popstate', () => this.hide());
            d3.select('#l3hidedetail').on('click', () => {
                d3.event.preventDefault();
                this.hide();
            });
            let selected = null;
            const fuse = new mandelicu.fuse(666, () => {
                navigator.vibrate && navigator.vibrate(100);
                selected.node.classList.add('l3fieldtoedit');
                setTimeout(() => selected.node.classList.remove('l3fieldtoedit'), 100);
            });
            const reviseField = async () => {
                fuse.reset();
                try {
                    selected.node[selected.targetAttr] = await selected.rev(selected.item, selected.fieldName);
                } catch (err) {
                    console.log(err);
                }
                this.wikiLink.href = this.species.wikiLink;
            };
            this.panel.on('mouseup', () => fuse.fails ? reviseField() : fuse.reset());
            this.panel.on('touchend', () => fuse.fails ? reviseField() : fuse.reset());
            this.panel.selectAll('.l3field').each(function() {
                const activate = d => {
                    selected = d;
                    fuse.countDown();
                };
                d3.select(this)
                    .on('mousedown', activate)
                    .on('touchstart', activate);
            });
            api.ev.reviseTree.sub(async msg => {
                if ( this.active && (this.tree.id === msg.id) ) {
                    const [tree] = await api.query('allTrees', {where: {id: msg.id}}, true);
                    Object.assign(this.tree, tree);
                    this.show(this.tree, true);
                }
            });
            species.ev.update.sub(speciesList => speciesList.forEach(s => {
                if ( this.active && this.species && (s.id === this.species.id) ) {
                    this.show(this.tree, true);
                }
            }));
            const divStatus = document.querySelector('.l3detailstatus > .l3field');
            mandelicu.addInputOptions({
                div: divStatus,
                options: ['healthy', 'exists', 'needs help', 'dying', 'dead', 'missing'],
                onchoose: status => api.reviseTree(this.tree.id, 'reported_status', status)
            });
            return this;
        }
    }.init();
    
    const formatName = (name,vacant) => (vacant ? `<span class="l3vacant">${name}</span>` : `${name}`);
    const activatePin = () => {
        const t = detail.tree;
        const s = state.species()[t.speciesId] || {};
        const pin = mandelicu.querydotdot('#l3pintext');
        const goDetails = event => {
            event.preventDefault();
            detail.show(t);
        };
        pin.listen('#l3pincommon', 'click', goDetails, a => { a.innerHTML = formatName(s.common_name, !s.alive); });
        pin.listen('#l3pinthumba', 'click', goDetails);
        pin('#l3pinthumb', thumb => {
            if ( s.wikiThumb ) {
                thumb.src = s.wikiThumb;
                thumb.style.display = '';
            } else {
                thumb.style.display = 'none';
            }
        });
        pin('#l3pinbotanical', txt => { txt.innerHTML = formatName(s.botanical_name); });
        pin('#l3pinwhere', txt => { txt.textContent = `${t.address} ${t.street} (${t.side})`; });
        pin('#l3pinsize', txt => { txt.innerHTML = `${s.alive ? (+(t.leaf_surface_area_in_sq_ft||0)).toFixed(0)+" ft<sup>2</sup> leaf area" : ''}`; });
        pin('#l3pinwiki', a => {
            a.href = s.wikiLink;
            a.style.display = s.wikiLink ? '' : 'none';
        });
        let yesno;
        const btnFav = pin.listen('#l3pinfav', 'click', () => {
            yesno ? treeFavs.delete(t.id) : treeFavs.add(t.id);
            updatePin(!yesno);
        });
        updatePin = yn => {
            yesno = (yn === undefined) ? treeFavs.value.has(t.id) : yn;
            if ( yesno ) {
                btnFav.classList.add('l3favtreeyes');
                btnFav.textContent = '\u2605';
                btnFav.title = 'Favorite';
            } else {
                btnFav.classList.remove('l3favtreeyes');
                btnFav.textContent = '\u2606';
                btnFav.title = 'Add to favorites';
            }
        };
        updatePin();
    };
    const pinHTML = document.getElementById('l3pinhtml').text;
    const formatPin = t => {
        detail.tree = t;
        setTimeout(activatePin, 200);
        return pinHTML;
    };

    const iconUrl = (key, options={}) => L.icon(Object.assign({
        iconSize: [25, 41],
        shadowSize: [25, 41],
        iconAnchor: [12, 41],
        shadowAnchor: [6, 41],
        iconUrl: `js/images/marker-${key}.png`,
        shadowUrl: 'js/images/marker-shadow.png',
    }, options));
    const map = {
        map: L.map( 'l3map', {
            center: [(state.lat0() + state.lat1())/2, (state.long0()+state.long1())/2],
            minZoom: 10,
            zoom: 18
        }),
        markerIcons: [iconUrl('open'), iconUrl('icon')],
        markers: [],
        centerMarker: null,
        centerIcon: iconUrl('center', {
            iconSize: [25, 25],
            shadowUrl: ''
        }),
        popped: false,
        _render() {
            this.markers.forEach(marker => this.map.removeLayer(marker));
            setTimeout(() => {
                const species = state.species();
                this.markers = state.trees().map(d => {
                    const marker = L.marker([d.latitude, d.longitude])
                          .bindPopup(layer => formatPin(d))
                          .setIcon(this.markerIcons[(!species[d.speciesId].alive)|0])
                          .addTo(this.map);
                    return marker;
                });
            }, 500);
        },
        move() {
            const bounds = this.map.getBounds();
            const north = bounds.getNorth();
            const east = bounds.getEast();
            const west = bounds.getWest();
            const south = bounds.getSouth();
            if ( north !== south && east !== west ) {
                state.lat0(south);
                state.lat1(north);
                state.long0(west);
                state.long1(east);
            }
        },
        init() {
            L.tileLayer( apis.openStreetMap, {
                attribution: apis.openStreetMapAttr,
                subdomains: ['a','b','c'],
                minZoom: 10// , // would need to run own osm server and make hires tiles
                // maxZoom: 20,
                // maxNativeZoom: 20
            }).addTo(this.map);
            this.render = mandelicu.batchDelayed(() => this._render(), 600);
            state.ev.trees.sub(this.render);
            this.render();
            this.map.on('zoom', () => this.popped || this.move());
            this.map.on('moveend', () => this.popped || this.move());
            this.map.on('autopanstart', () => {
                this.popped = true;
                setTimeout(() => { this.popped = false; }, 1500);
            });
            this.map.fitBounds([
                [state.lat0(), state.long0()],
                [state.lat1(), state.long1()]
            ]);
            return this;
        }
    }.init();

    const btnGeolocate = d3.select('#l3geolocate').on('click', () => {
        btnGeolocate.disabled = true;
        [false, true].forEach(enableHighAccuracy => navigator.geolocation.getCurrentPosition(({coords}) => {
            btnGeolocate.classList.remove('l3geofail');
            if ( enableHighAccuracy ) {
                btnGeolocate.disabled = false;
            }
            map.map.panTo([coords.latitude, coords.longitude]);
            map.centerMarker && map.map.removeLayer(map.centerMarker);
            map.centerMarker = L.marker([coords.latitude, coords.longitude])
                .setIcon(map.centerIcon)
                .addTo(map.map);
        }, err => {
            btnGeolocate.classList.add('l3geofail');
            if ( enableHighAccuracy ) {
                btnGeolocate.disabled = false;
            }
        }, {
            enableHighAccuracy
        }));
    }).node();
    
    const updateTrees = mandelicu.batchDelayed(async () => {
        const speciesId = state.speciesId();
        if ( speciesId === species.ID_FAV ) {
            state.trees(await api.favTreesIn(state.lat0(), state.long0(), state.lat1(), state.long1()));
        } else {
            state.trees(await api.treesIn(state.lat0(), state.long0(), state.lat1(), state.long1(), {
                speciesId: speciesId || undefined
            }));
        }
    }, 1000);

    state.ev.lat0.sub(updateTrees);
    state.ev.long0.sub(updateTrees);
    state.ev.lat1.sub(updateTrees);
    state.ev.long1.sub(updateTrees);
    state.ev.speciesId.sub(updateTrees);
    updateTrees();

    if ( window.location.hash.length > 1 ) {
        api.query('allTrees', {where: {id: window.location.hash.substring(1)}}, true)
            .then(([t]) => detail.show(t))
            .catch(err => { window.location.hash = ""; });
    }

    const intro = {
        box: document.getElementById('intro'),
        show: document.getElementById('introShow'),
        main: document.getElementById('introMain'),
        init() {
            this.main.style.display = 'none';
            this.show.querySelector('button')
                .addEventListener('click', () => {
                    this.show.style.display = 'none';
                    this.main.style.display = '';
                    this.box.style.left = '2em';
                    this.box.style.top = '.1em';
                    state.introShow('auto');
                });
            this.main.querySelector('#introClose')
                .addEventListener('click', () => {
                    this.show.style.display = '';
                    this.main.style.display = 'none';
                    this.box.style.left = '';
                    this.box.style.top = '';
                    state.introShow('none');
                });
            const screenSel = d3.select(this.main).selectAll('.introScreen'),
                  screens = [];
            screenSel.style('display', 'none');
            screenSel.each(function() {
                this.innerHTML = downMarker.makeHtml(this.innerHTML);
                screens.push(this);
            });
            state.introScreen((state.introScreen() + 1) % screens.length);
            const btnInstall = d3.select(screens[0]).insert('button', 'p').style({
                float: 'right',
                margin: '1em'
            }).node();
            new mandelicu.InstallButton({node: btnInstall});
            let screenIndex = state.introScreen();
            if ( screens[screenIndex] ) {
                screens[screenIndex].style.display = '';
            }
            const btnPrev = this.main.querySelector('#introPrev');
            btnPrev.addEventListener('click', () => {
                if ( screenIndex ) {
                    screens[screenIndex].style.display = 'none';
                    --screenIndex;
                    screens[screenIndex].style.display = '';
                    state.introScreen(screenIndex);
                }
                btnPrev.disabled = (screenIndex === 0);
                btnNext.disabled = false;
            });
            const btnNext = this.main.querySelector('#introNext');
            btnNext.addEventListener('click', () => {
                if ( screenIndex < (screens.length - 1) ) {
                    screens[screenIndex].style.display = 'none';
                    ++screenIndex;
                    screens[screenIndex].style.display = '';
                    state.introScreen(screenIndex);
                }
                btnPrev.disabled = false;
                btnNext.disabled = (screenIndex >= (screens.length - 1));
            });
            btnPrev.disabled = (screenIndex === 0);
            btnNext.disabled = (screenIndex >= (screens.length - 1));
            d3.select('#introControls').node().style.display = (screens.length > 1) ? '' : 'none';
            this.main.querySelector('#introHide').style.display = 'none';
            if ( state.introShow() === 'auto' ) {
                this.show.querySelector('button').click();
            }
            return this;
        }
    }.init();

    return {
        start: async () => ({
            api, apis, detail, genNotes, intro, map, notes, revise, species, state, treeFavs
        })
    };
});

// flag display -- consider third "my post was flagged" button

// write notes on edible species
// finish missing wiki links and thumbs
// trail: trees of mark twain's acquaintance (*who knows?)

// write about edible harvesting and knowledge sharing

// retest notes and flagging, for tree and species


