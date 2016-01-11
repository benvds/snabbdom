// jshint newcap: false
/* global require, module, document, Element */
'use strict';

var global = window;
var VNode = require('./vnode');
var is = require('./is');

function isUndef(s) { return s === undefined; }
function isDef(s) { return s !== undefined; }

function emptyNodeAt(elm) {
    return VNode(elm.tagName, {}, [], undefined, elm);
}

var emptyNode = VNode('', {}, [], undefined, undefined);

function sameVnode(vnode1, vnode2) {
    return vnode1.key === vnode2.key && vnode1.sel === vnode2.sel;
}

function createKeyToOldIdx(children, beginIdx, endIdx) {
    var i, map = {}, key;
    for (i = beginIdx; i <= endIdx; ++i) {
        key = children[i].key;
        if (isDef(key)) map[key] = i;
    }
    return map;
}

function createRmCb(childElm, listeners) {
    return function() {
        if (--listeners === 0) childElm.parentElement.removeChild(childElm);
    };
}

var hooks = ['create', 'update', 'remove', 'destroy', 'pre', 'post'];

function init(modules) {
    var i, j, cbs = {};
    for (i = 0; i < hooks.length; ++i) {
        cbs[hooks[i]] = [];
        for (j = 0; j < modules.length; ++j) {
            if (modules[j][hooks[i]] !== undefined) cbs[hooks[i]].push(modules[j][hooks[i]]);
        }
    }

    function createElm(vnode, insertedVnodeQueue) {
        var i;
        var data = vnode.data;

        if (isDef(data)) {
            if (isDef(i = data.hook) && isDef(i = i.init)) i(vnode);
            if (isDef(i = data.vnode)) vnode = i; // is vnode.data.vnode is set then make it vnode
        }

        var elm;
        var children = vnode.children;
        var sel = vnode.sel;

        if (isDef(sel)) {
            // Parse selector
            var hashIndex = sel.indexOf('#');
            var dotIndex = sel.indexOf('.', hashIndex);
            var hash = (hashIndex > 0) ? hashIndex : sel.length;
            var dot = (dotIndex > 0) ? dotIndex : sel.length;
            var tag = hashIndex !== -1 || dotIndex !== -1 ? sel.slice(0, Math.min(hash, dot)) : sel;

            // looks if ns (namespace) is set in data and uses that, used for svg/xul
            elm = vnode.elm = (isDef(data) && isDef(i = data.ns)) ?
                document.createElementNS(i, tag) :
                document.createElement(tag);

            // set the id
            if (hash < dot) elm.id = sel.slice(hash + 1, dot);

            // set the classes
            if (dotIndex > 0) elm.className = sel.slice(dot+1).replace(/\./g, ' ');

            if (is.array(children)) { // create children
                for (i = 0; i < children.length; ++i) {
                    elm.appendChild(createElm(children[i], insertedVnodeQueue));
                }
            } else if (is.primitive(vnode.text)) { // set content string or number
                elm.appendChild(document.createTextNode(vnode.text));
            }

            // run create callback hooks
            for (i = 0; i < cbs.create.length; ++i) {
                cbs.create[i](emptyNode, vnode)
            };

            i = vnode.data.hook; // Reuse variable

            if (isDef(i)) { // has data hooks
                if (i.create) { i.create(emptyNode, vnode); } // run create hook

                if (i.insert) { insertedVnodeQueue.push(vnode); } // push node into inserteredVnodeQueue
            }
        } else {
            elm = vnode.elm = document.createTextNode(vnode.text);
        }

        return vnode.elm;
    }

    // add child vnodes
    function addVnodes(parentElm, before, vnodes, startIdx, endIdx, insertedVnodeQueue) {
        for (; startIdx <= endIdx; ++startIdx) {
            parentElm.insertBefore(createElm(vnodes[startIdx], insertedVnodeQueue), before);
        }
    }

    function invokeDestroyHook(vnode) {
        var i = vnode.data, j;
        if (isDef(i)) {
            if (isDef(i = i.hook) && isDef(i = i.destroy)) i(vnode);
            for (i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode);
            if (isDef(i = vnode.children)) {
                for (j = 0; j < vnode.children.length; ++j) {
                    invokeDestroyHook(vnode.children[j]);
                }
            }
        }
    }

    // remove child vnodes
    function removeVnodes(parentElm, vnodes, startIdx, endIdx) {
        for (; startIdx <= endIdx; ++startIdx) {
            var i, listeners, rm, ch = vnodes[startIdx];
            if (isDef(ch)) {
                if (isDef(ch.sel)) {
                    invokeDestroyHook(ch);
                    listeners = cbs.remove.length + 1;
                    rm = createRmCb(ch.elm, listeners);
                    for (i = 0; i < cbs.remove.length; ++i) cbs.remove[i](ch, rm);
                    if (isDef(i = ch.data) && isDef(i = i.hook) && isDef(i = i.remove)) {
                        i(ch, rm);
                    } else {
                        rm();
                    }
                } else { // Text node
                    parentElm.removeChild(ch.elm);
                }
            }
        }
    }

    function updateChildren(parentElm, oldCh, newCh, insertedVnodeQueue) {
        var oldStartIdx = 0, newStartIdx = 0;
        var oldEndIdx = oldCh.length - 1;
        var oldStartVnode = oldCh[0];
        var oldEndVnode = oldCh[oldEndIdx];
        var newEndIdx = newCh.length - 1;
        var newStartVnode = newCh[0];
        var newEndVnode = newCh[newEndIdx];
        var oldKeyToIdx, idxInOld, elmToMove, before;

        while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
            if (isUndef(oldStartVnode)) {
                oldStartVnode = oldCh[++oldStartIdx]; // Vnode has been moved left
            } else if (isUndef(oldEndVnode)) {
                oldEndVnode = oldCh[--oldEndIdx];
            } else if (sameVnode(oldStartVnode, newStartVnode)) {
                patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue);
                oldStartVnode = oldCh[++oldStartIdx];
                newStartVnode = newCh[++newStartIdx];
            } else if (sameVnode(oldEndVnode, newEndVnode)) {
                patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue);
                oldEndVnode = oldCh[--oldEndIdx];
                newEndVnode = newCh[--newEndIdx];
            } else if (sameVnode(oldStartVnode, newEndVnode)) { // Vnode moved right
                patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue);
                parentElm.insertBefore(oldStartVnode.elm, oldEndVnode.elm.nextSibling);
                oldStartVnode = oldCh[++oldStartIdx];
                newEndVnode = newCh[--newEndIdx];
            } else if (sameVnode(oldEndVnode, newStartVnode)) { // Vnode moved left
                patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue);
                parentElm.insertBefore(oldEndVnode.elm, oldStartVnode.elm);
                oldEndVnode = oldCh[--oldEndIdx];
                newStartVnode = newCh[++newStartIdx];
            } else {
                if (isUndef(oldKeyToIdx)) oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx);
                idxInOld = oldKeyToIdx[newStartVnode.key];
                if (isUndef(idxInOld)) { // New element
                    parentElm.insertBefore(createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm);
                    newStartVnode = newCh[++newStartIdx];
                } else {
                    elmToMove = oldCh[idxInOld];
                    patchVnode(elmToMove, newStartVnode, insertedVnodeQueue);
                    oldCh[idxInOld] = undefined;
                    parentElm.insertBefore(elmToMove.elm, oldStartVnode.elm);
                    newStartVnode = newCh[++newStartIdx];
                }
            }
        }
        if (oldStartIdx > oldEndIdx) {
            before = isUndef(newCh[newEndIdx+1]) ? null : newCh[newEndIdx+1].elm;
            addVnodes(parentElm, before, newCh, newStartIdx, newEndIdx, insertedVnodeQueue);
        } else if (newStartIdx > newEndIdx) {
            removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx);
        }
    }

    function patchVnode(oldVnode, vnode, insertedVnodeQueue) {
        var i, hook;

        // run prepatch hook
        if (isDef(i = vnode.data) && isDef(hook = i.hook) && isDef(i = hook.prepatch)) {
            i(oldVnode, vnode);
        }

        // get the vnode on oldVnode.data.vnode
        if (isDef(i = oldVnode.data) && isDef(i = i.vnode)) oldVnode = i;

        // get the vnode on vnode.data.vnode
        if (isDef(i = vnode.data) && isDef(i = i.vnode)) vnode = i;

        var elm = vnode.elm = oldVnode.elm;
        var oldCh = oldVnode.children;
        var ch = vnode.children;

        // don't do anything when nodes are the same
        if (oldVnode === vnode) return;

        if (isDef(vnode.data)) {
            // run all update hooks
            for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode);

            // run current update hook
            i = vnode.data.hook;
            if (isDef(i) && isDef(i = i.update)) i(oldVnode, vnode);
        }

        if (isUndef(vnode.text)) { // render children
            if (isDef(oldCh) && isDef(ch)) {
                // update children when different
                if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue);
            } else if (isDef(ch)) {
                // add new children when old was empty
                addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue);
            } else if (isDef(oldCh)) {
                // remove children when new is empty
                removeVnodes(elm, oldCh, 0, oldCh.length - 1);
            }
        } else if (oldVnode.text !== vnode.text) { // render textContent
            elm.textContent = vnode.text;
        }

        // runt postpatch hook
        if (isDef(hook) && isDef(i = hook.postpatch)) {
            i(oldVnode, vnode);
        }
    }

    return function(oldVnode, vnode) {
        var i;
        var insertedVnodeQueue = [];

        for (i = 0; i < cbs.pre.length; ++i) {
            cbs.pre[i]()
        };

        if (oldVnode instanceof global.Element) {
            if (oldVnode.parentElement !== null) {
                createElm(vnode, insertedVnodeQueue);
                oldVnode.parentElement.replaceChild(vnode.elm, oldVnode);
            } else { // top element (<html>)
                oldVnode = emptyNodeAt(oldVnode);
                patchVnode(oldVnode, vnode, insertedVnodeQueue);
            }
        } else {
            patchVnode(oldVnode, vnode, insertedVnodeQueue);
        }

        // run insert hooks
        for (i = 0; i < insertedVnodeQueue.length; ++i) {
            insertedVnodeQueue[i].data.hook.insert(insertedVnodeQueue[i]);
        }

        for (i = 0; i < cbs.post.length; ++i) {
            cbs.post[i]();
        };

        return vnode;
    };
}

module.exports = {init: init};
