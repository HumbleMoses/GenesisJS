// 不添加到生成的dom元素中的属性
const ignoredAttr = [
    "dom",
    "children",
    "content",
    "uiType",
    "param",
    "visible",
    "hidden",
    "label",
    "tip",
    "databind",
    "invalid",
    "validate",
    "validator",
    "rule",
    "ruleOptions",
    "callback",
    "fulfilled",
    "init",
    "mountedToDocument",
    "waitFor",
    "lis",
    "isCustom",
];
const stateMap = new Map();

/**
 * TODO 平铺样式
 * @param styles
 * @param selector
 * @returns {string}
 */
const _flatStyle = (styles, selector = "") => {
    let styleStr = "";
    const styleItems = [];
    Object.keys(styles).map(key => {
        const style = styles[key];
        if (!style) {
            return;
        }
        if (!(style instanceof Object)) {
            return styleItems.push(`${key}: ${style}`);
        }
        if (!~key.search(/:(is|has|where)/g)) {
            return styleStr += _addStyle(style, `${selector + key.trimStart()} `);
        }
        if (styleStr.length && key.includes(",") && ~key.search(/[<+~]/g)) {
            return styleStr += _addStyle(style, `${selector} :is(${key}) `);
        }

        key.split(",").map(subSel => styleStr += _addStyle(style, `${selector + subSel.trimStart()} `));
    });

    if (styleItems.length) {
        styleStr += `\n\n${selector}{\n\t${styleItems.join(";\n\t")};\n}`;
    }

    return styleStr;
};

/**
 * TODO 动态生成css（对外） :后续要支持复杂css语法
 * @param moduleId
 * @param styles
 * @returns {string}
 */
const appendStylesheet = (moduleId = "nameless", styles) => {
    /*const preWrap = `\n\n/!* -------------- ${moduleId} style >> -------------- *!/`;
    const sufWrap = `\n\n/!* -------------- ${moduleId} style << -------------- *!/\n`;
    const styledModuleIds = store("styledModuleIds") || [];
    let $style = $("style");
    if ($style.length) {
        $style = $style.first();
        const styleText = $style.text();
        // 不重复添加样式
        if (!styledModuleIds.includes(moduleId) || !styleText.includes(`${moduleId} style >>`)) {
            $style.text(styleText + preWrap + _flatStyle(styles) + sufWrap);
        }
    } else {
        $("head").append(`<style>${preWrap}${_flatStyle(styles)}${sufWrap}</style>`);
    }

    // 缓存已添加样式的moduleId
    styledModuleIds.push(moduleId);
    store("styledModuleIds", styledModuleIds);*/
};

/**
 * 逐级添加行内样式
 * @param dom
 * @param styles
 */
const cascadeAddStyle = (dom, styles) => {
    if (!dom || !styles) {
        return;
    }

    const cssAttr = {};
    const nodeList = Array.isArray(dom) ? Array.from(dom) : [dom];
    Object.keys(styles).map(key => {
        const attr = styles[key];
        if ([undefined, null].includes(attr)) {
            return;
        }
        if (Array.isArray(attr)) {
            // TODO 待完善
        }
        if (["string", "number", "boolean"].includes(typeof attr)) {
            cssAttr[key] = attr;
        }
        if (typeof attr === "function") {
            attr(nodeList);
        }
        if (typeof attr === "object") {
            try {
                cascadeAddStyle(nodeList.flatMap(node => Array.from(node.querySelectorAll(`${~key.search(/^([>+~])/) ? ":scope " : ""}${key}`))), attr);
            } catch (err) {
                console.error(err);
                // console.trace();
            }
        }
    });
    Object.entries(cssAttr).map(([prop, value]) => nodeList.map(node => ![undefined, null].includes(value) && (node.style[prop] = value)));
};

/**
 * 展开函数组件
 * @param prop
 * @returns {_unfoldVdom|*}
 * @private
 */
function _unfoldVdom(prop = {}) {
    const vdom = this;
    if (typeof this !== "function") {
        return vdom;
    }

    /*if (!vdom.stateMap) {
        const vdomSign = vdom.toString();
        vdom.stateMap = stateMap.get(vdomSign) || new Map();
        vdom.stateMap && stateMap.set(vdomSign, vdom.stateMap);
        stateMap.get(vdomSign).stateMap = new Map();
        stateMap.set(vdomSign, vdom.stateMap = stateMap.get(vdomSign) || new Map());
    }*/
    vdom.stateMap ??= new Map();

    const stateMapIt = vdom.stateMap[Symbol.iterator]();
    const execRerender = ((prop) => {
        let innerRerender;
        Object.assign(vdom, {
            setRerender(rerender) {
                innerRerender = rerender;
            },
        })

        return async (innerProp = {}) => innerRerender(Object.assign(prop, innerProp));
    })(prop);

    return _unfoldVdom.call(vdom.call(vdom, Object.assign(prop, {
        useState: (initState) => {
            const currentStateObj = stateMapIt.next();
            if (currentStateObj.done) {
                vdom.stateMap.set({
                    state: initState,
                }, (newState, rerender = false) => {
                    // stateMap.get(vdom.toString()).stateMap = vdom.stateMap;
                    currentStateObj.value[0].state = newState;
                    rerender && execRerender();
                });
                currentStateObj.value = Array.from(vdom.stateMap.entries()).pop();
                currentStateObj.value[1].reset = (rerender = false) => {
                    currentStateObj.value[0].state = initState;
                    rerender && execRerender();
                };
            }
            const [{state}, setState] = currentStateObj.value;

            return [state, setState, () => state];
        },
        clearAllState: () => {
            vdom.stateMap.clear();
            execRerender();
        },
        rerender: (prop) => {
            execRerender(prop);
        },
    })));
}

/**
 * 初始化vdom -> dom
 * @param vdom
 * @returns {HTMLDivElement|HTMLElement|*|HTMLElement|void|Text|Text}
 * @private
 */
function _initVdom2Dom(vdom = {}) {
    if (typeof vdom === "string") {
        return document.createTextNode(vdom);
    }

    const tag = vdom.uiType || "div";
    if (typeof tag === "string") {
        const node = document.createElement(tag);
        vdom.content && (node.textContent = vdom.content);

        return node;
    }

    try {
        // const args = typeof tag === "function" ? [tag, vdom.param] : [vdom];
        return _vdom2FinalDom.call(tag, vdom.param);
    } catch (e) {
        const errNode = document.createElement("div");
        errNode.textContent = e;
        errNode.className = "c5-alert c5-alert-danger";

        return errNode;
    }
}

/**
 * 获取属性执行函数配置
 * @param vdom
 * @param dom
 * @returns {{updateVdomValue(*): void, class(): void, style(): void, jStyle(): void, event(): void, default(*): void}}
 * @private
 */
function _getPropFuncConfig(vdom, dom) {
    let vdomValue;

    return {
        class() {
            vdomValue && dom.classList.add(...(Array.isArray(vdomValue) ? vdomValue : vdomValue.split(" ")));
        },
        style() {
            Array.isArray(vdomValue) ? appendStylesheet(...vdomValue) : cascadeAddStyle(dom, vdomValue);
        },
        event() {
            // 事件
            Object.entries(vdomValue).map(([evtName, evtFunc]) => {
                dom.addEventListener(evtName, function (e) {
                    return evtFunc(e);
                });
            });
        },
        updateVdomValue(name) {
            vdomValue = vdom[name];
        },
        validator() {
            $(dom).validator(vdomValue);
        },
        default(name) {
            if (!name || !vdomValue || (typeof vdomValue === "function") || ignoredAttr.includes(name)) {
                return;
            }
            dom.setAttribute(name, vdomValue);
        },
    };
}

/**
 * vdom -> 最终dom
 * @param prop
 * @returns {HTMLDivElement|HTMLDivElement|*|HTMLElement|void|Text}
 * @private
 */
function _vdom2FinalDom(prop = {}) {
    const _this = this
    const vdom = _unfoldVdom.call(this, prop);
    if (Array.isArray(vdom)) {
        return vdom.map(item => typeof item === "string" ? item : _vdom2FinalDom.apply(item));
    }
    if ([vdom.visible, prop.visible, !vdom.hidden, !prop.hidden].includes(false)) {
        return;
    }

    const dom = _this.dom = _initVdom2Dom.call(_this, vdom);
    typeof _this === "function" && _this.setRerender((prop = {}) => render(_this.dom, _this, prop));

    // TODO 等待其他节点渲染完毕
    /*if (vdom.waitFor && !vdom.waitFor.fulfilled) {
        dom = document.createElement("div");
        vdom.waitFor.then((param) => {
            vdom.waitFor.fulfilled = true;
            _this.getRerender();
        });
    }*/

    vdom.init && (async (dom) => vdom.init(dom))(dom);
    const propFunc = _getPropFuncConfig(vdom, dom);
    Object.keys(vdom).map(name => {
        if (!vdom[name]) {
            return;
        }

        propFunc.updateVdomValue(name);
        (propFunc[name] || propFunc.default)(name);
    });

    // 子节点
    if (vdom.children) {
        !Array.isArray(vdom.children) && (vdom.children = [vdom.children]);
        vdom.children.flatMap(item => item).map(item => {
            const node = typeof item === "string" ? item : _vdom2FinalDom.apply(item);
            node && dom.append(...(Array.isArray(node) ? node : [node]));
        });
    }

    // 给子节点添加样式
    vdom.style && cascadeAddStyle(dom, Object.fromEntries(Object.entries(vdom.style).filter(([key, value]) => typeof value === "object")));
    vdom.fulfilled && (!vdom.uiType?.startsWith("c5.")) && (async (originalVdom, dom) => vdom.fulfilled({
        vdom: originalVdom,
        dom,
    }))(_this, dom);

    return dom;
}

/**
 * 渲染组件
 * @param targetNode
 * @param vdom
 * @param prop
 * @returns {HTMLDivElement|*|HTMLElement|void|Text}
 */
function render(targetNode, vdom = {}, prop = {}) {
    try {
        const dom = _vdom2FinalDom.call(vdom, prop);
        if (targetNode) {
            // TODO 替换时怎样处理class更合适
            // targetNode.className && dom.classList.add(...Array.from(targetNode.classList));
            targetNode.replaceWith(dom);
            vdom.dom = dom;
        }
        targetNode = dom;
    } catch (err) {
        targetNode && (targetNode.textContent = err);
        console.error(err);
        // console.trace();
    }

    return targetNode;
}

/**
 * 生成promise快捷工具
 * @returns {{}}
 */
function genPromise(pTool = {}) {
    const tool = pTool;
    tool.promise = new Promise((resolve, reject) => {
        tool.resolve = resolve;
        tool.reject = reject;
    });

    return tool;
}

Object.assign(render, {
    appendStylesheet,
    genPromise,
});

export {render};
