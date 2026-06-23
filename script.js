// 原始专页 ID
const origPageId = document.getElementById('orig-page-id')
// 目标专页 ID
const targetPageId = document.getElementById('target-page-id')
// 复制流程按钮
const copyFlowBtn = document.getElementById('copy-flow-button')
// 原始专页访问令牌
const origToken = document.getElementById('orig-token')
// 日志
const logEl = document.getElementById('log')

const token = {
  user: '', // 当前账号
  orig: origToken.value // 原始专页
}

/**
 * @description 日志
 * @param {string} text - 文本
 */
const log = text => {
  if (!text) {
    logEl.value = ''
  } else {
    logEl.value += text + '\n'
    logEl.scrollTop = logEl.scrollHeight
  }
}

/**
 * @description 递归遍历 Object，将其中包含 targetText 的值替换为 replaceText
 * @param {(Object|Array)} obj - 原始对象
 * @param {string} targetText - 要匹配的文本
 * @param {string} replaceText - 替换成的文本
 * @returns {(Object|Array)} - 替换后的新对象
 */
function deepReplaceText (obj, targetText, replaceText) {
  // 如果是数组
  if (Array.isArray(obj)) {
    obj.forEach(item => deepReplaceText(item, targetText, replaceText))
    return obj
  }

  // 如果是对象
  if (obj && typeof obj === 'object') {
    for (const key in obj) {
      obj[key] = deepReplaceText(obj[key], targetText, replaceText)
    }
    return obj
  }

  // 如果是字符串，替换文本
  if (typeof obj === 'string') {
    return obj.replaceAll(targetText, replaceText)
  }

  return obj
}

// function deepReplaceText (obj, targetText, replaceText) {
//   // 如果是数组
//   if (Array.isArray(obj)) {
//     return obj.map(item => deepReplaceText(item, targetText, replaceText))
//   }

//   // 如果是对象
//   if (typeof obj === 'object' && obj !== null) {
//     const newObj = {}
//     for (const key in obj) {
//       if (Object.hasOwn(obj, key)) {
//         newObj[key] = deepReplaceText(obj[key], targetText, replaceText)
//       }
//     }
//     return newObj
//   }

//   // 如果是字符串，替换文本
//   if (typeof obj === 'string') {
//     return String(obj) === String(targetText) ? replaceText : obj
//     // return obj === targetText ? replaceText : obj
//     // return obj.includes(targetText) ? obj.replaceAll(targetText, replaceText) : obj
//   }

//   // 其它类型不变
//   return obj
// }

// 验证基本信息是否填写规范
async function verify () {
  // 清空日志
  log('')
  if (!/^\d+$/.test(origPageId.value)) {
    log('❌ 原始专页ID填写错误')
    return false
  }
  if (!targetPageId.value) {
    log('❌ 未填写需要复制流程的专页ID')
    return false
  }
  if (!origToken.value) {
    log('❌ 未填写原始专页访问令牌')
    return false
  }
  token.orig = origToken.value
  try {
    // 通过 cookies 获取 token
    token.user = await new Promise((resolve, reject) => {
      chrome.cookies.getAll({ domain: 'botcake.io', name: 'token_jwt' }, cookies => {
        if (chrome.runtime.lastError) {
          // Chrome 扩展特有的错误信息
          return reject(chrome.runtime.lastError)
        }
        if (!cookies || cookies.length === 0 || !cookies[0].value) {
          return reject(new Error('未获取到 token_jwt Cookie'))
        }
        resolve(cookies[0].value)
      })
    })
  } catch (error) {
    console.error(error)
    log('❌ 无法获取当前账号的访问令牌，请确认是否登陆 Botcake')
    return false
  }
  try {
    // 解析 token
    const json = JSON.parse(atob(origToken.value.split('.')[1]))
    // 获取 token 的过期时间
    const validTime = new Date(json.exp * 1000).toLocaleDateString()
    if (json.exp * 1000 < new Date().getTime()) {
      log(`❌ 原始专页访问令牌已过期 ${validTime}`)
      return false
    }

    log(`✅ 原始专页访问令牌有效期至: ${validTime}`)
    return true
  } catch (error) {
    console.error(error)
    log('❌ 原始专页访问令牌格式错误')
    return false
  }
}

copyFlowBtn.addEventListener('click', async () => {
  // 检测是否填写规范
  if (!(await verify())) return
  const targetPageIds = targetPageId.value.match(/.+/g)

  log('💬 正在获取专页清单')
  const pageList = await getPageList()
  log('✅ 已获取所有专页清单')

  // 检测是否拥有原始专页权限
  const pageInfo = pageList.filter(x => x.id === origPageId.value)
  if (pageInfo.length === 0) {
    log('💬 正在获取原始专页邀请权限')
    const inviteId = await getInviteLink()
    // 原始专页 token 没有足够权限
    if (!inviteId) {
      log('❌ 无法获取原始专页邀请权限，请检查原始专页访问令牌是否正确。')
      return
    }

    // 接受管理员权限邀请
    const acceptPermission = await acceptInviteLink(inviteId)
    if (!acceptPermission) {
      log('❌ 无法获取原始专页邀请权限')
      return
    }
  }

  log('-------------------------------------')
  for (const pageId of targetPageIds) {
    log(`💬 ${pageId} 开始复制流程`)
    await cleanOldData(pageId)
    // 复制流程
    const copyFlowStatus = await copyFlow(pageId)
    if (copyFlowStatus) {
      log('✅ 复制流程成功')
    } else {
      log('❌ 复制流程失败')
      log('-------------------------------------')
      continue
    }

    log('💬 正在获取自定义字段')
    // 获取原始专页自定义字段
    const origFields = await getFields(origPageId.value)
    // 获取目标专页自定义字段
    const targetFields = await getFields(pageId)
    log('✅ 获取自定义字段完成')

    log('💬 正在获取标签')
    const tags = await getTagIds(pageId)
    log('✅ 获取标签完成')

    // 获取流程 ID
    const flowIds = await getFlowId(pageId)
    for (const flowId of flowIds) {
      // 获取流程内容
      const flowContent = await getFlowContent(pageId, flowId)
      if (!flowContent.success) {
        log('❌ 无法获取专页流程')
        log('-------------------------------------')
        continue
      }
      // 替换流程
      const replaceFlowVariableStatus = await replaceFlowVariable(pageId, flowContent, origFields, targetFields)
      console.log('origFields', origFields)
      console.log('targetFields', targetFields)
      if (replaceFlowVariableStatus) {
        log('✅ 替换流程变量成功')
      } else {
        log('❌ 替换流程变量失败')
        log('-------------------------------------')
        continue
      }
      // 替换标签
      const replaceFlowTagStatus = await replaceFlowTag(pageId, flowContent, tags.tags)
      console.log('tags', tags.tags)
      if (replaceFlowTagStatus) {
        log('✅ 替换流程标签成功')
      } else {
        log('❌ 替换流程标签失败')
        log('-------------------------------------')
        continue
      }
    }

    // 开启关键词
    const isKeywordEnabled = await enableKeywords(pageId)
    if (isKeywordEnabled) {
      log('✅ 开启关键词成功')
    } else {
      log('❌ 开启关键词失败')
      log('-------------------------------------')
      continue
    }

    // 开启用户评论自动回复
    const isAutoReplyEnabled = await enableAutoReplyOnComment(pageId)
    if (isAutoReplyEnabled) {
      log('✅ 开启用户评论自动回复成功')
    } else {
      log('❌ 开启用户评论自动回复失败')
      log('-------------------------------------')
      continue
    }

    // 开启用户评论自动发消息
    const isAutoInboxEnabled = await enableAutoInboxOnComment(pageId)
    if (isAutoInboxEnabled) {
      log('✅ 开启用户评论自动发消息成功')
    } else {
      log('❌ 开启用户评论自动发消息失败')
      log('-------------------------------------')
      continue
    }

    // 开启仅限第一次评论
    const isFirstCommentOnlyEnabled = await enableOnlyFirstComment(pageId)
    if (isFirstCommentOnlyEnabled) {
      log('✅ 开启仅限第一次评论成功')
    } else {
      log('❌ 开启仅限第一次评论失败')
      log('-------------------------------------')
      continue
    }

    // 开启小组用户评论自动发消息
    const isAutoGroupReplyEnabled = await enableAutoCommentInGroup(pageId)
    if (isAutoGroupReplyEnabled) {
      log('✅ 开启小组用户评论自动发消息成功')
    } else {
      log('❌ 开启小组用户评论自动发消息失败')
      log('-------------------------------------')
      continue
    }

    // 开启仅回复一级评论
    const isAutoFirstReplyEnabled = await enableAutoReplyFirstComment(pageId)
    if (isAutoFirstReplyEnabled) {
      log('✅ 开启仅回复一级评论成功')
    } else {
      log('❌ 开启仅回复一级评论失败')
      log('-------------------------------------')
      continue
    }
    log('✅ 设置完成')
    log('-------------------------------------')
  }
  log('✅ 全部设置完成')
})

// 获取专页列表
async function getPageList () {
  const json = await fetch(`https://botcake.io/api/v1/pages?access_token=${token.user}&is_dashboard=true`, {
    headers: {
      accept: 'application/json'
    },
    credentials: 'include'
  }).then(response => response.json())
  return json.pages
}

// 获取管理员邀请链接
async function getInviteLink () {
  const body = new FormData()
  body.append('role', 'MANAGE')
  const json = await fetch(`https://botcake.io/api/v1/pages/${origPageId.value}/invite?access_token=${origToken.value}`, {
    headers: {
      accept: 'application/json'
    },
    body,
    method: 'POST',
    credentials: 'include'
  }).then(response => response.json())
  return `https://botcake.io/invitation/${json.invite_id}`
}

/**
 * @description 接受邀请链接
 * @param {string} inviteId - 邀请 ID
 * @returns {boolean} 请求状态
 */
async function acceptInviteLink (inviteId) {
  const body = new FormData()
  body.append('invite_id', inviteId)
  const json = await fetch(`https://botcake.io/api/v1/users/join?access_token=${token.user}`, {
    headers: {
      accept: 'application/json'
    },
    body,
    method: 'POST',
    credentials: 'include'
  }).then(response => response.json())
  return json.success
}

/**
 * @description 复制流程
 * @param {string} targetPageId - 目标专页 ID
 * @returns {boolean} 请求状态
 */
async function copyFlow (targetPageId) {
  const body = new FormData()
  body.append('checked_list_clone', JSON.stringify(['welcome_message', 'default_reply', 'main_menu', 'asked_question', 'tag', 'custom_field', 'bot_field', 'topic', 'growth_tools', 'broadcasts', 'sequences', 'keywords', 'flow', 'auto_cmt', 'lucky_wheel', 'product_source_botcake']))
  body.append('page_id_clones', JSON.stringify([targetPageId]))
  const json = await fetch(`https://botcake.io/api/v1/pages/${origPageId.value}/clone?access_token=${token.user}`, {
    body,
    method: 'POST'
  }).then(response => response.json())
  return json.success
}

/**
 * @description 复制流程
 * @param {string} targetPageId - 目标专页 ID
 * @returns {boolean} 请求状态
 */
async function copyFlow_debug (targetPageId) {
  const body = new FormData()
  body.append('checked_list_clone', JSON.stringify(['welcome_message', 'default_reply', 'main_menu', 'asked_question', 'tag', 'custom_field', 'bot_field', 'topic', 'growth_tools', 'broadcasts', 'sequences', 'keywords', 'flow', 'auto_cmt', 'lucky_wheel', 'product_source_botcake']))
  body.append('page_id_clones', JSON.stringify([targetPageId]))
  const json = await fetch(`https://botcake.io/api/v1/pages/${origPageId.value}/copy_flow_to_page?access_token=${token.user}`, {
    body,
    method: 'POST'
  }).then(response => response.json())
  return json.success
}

/**
 * @description 获取流程 ID
 * @param {string} pageId - 专页 ID
 * @returns {Array} 流程 ID
 */
async function getFlowId (pageId, isRemoved = false) {
  const body = new FormData()
  body.append('change', JSON.stringify({ isRemoved }))
  const json = await fetch(`https://botcake.io/api/v1/pages/${pageId}/flow?page_size=15&page=1&access_token=${token.user}`, {
    headers: {
      accept: 'application/json'
    },
    body,
    method: 'POST',
    credentials: 'include'
  }).then(response => response.json())
  return json.flows.map(x => x.id)
}

/**
 * @description 获取字段
 * @param {(string|number)} pageId - 专页 ID
 * @returns {Array} 格式 {{field_id/|field_name}}
 */
async function getFields (pageId) {
  const json = await fetch(`https://botcake.io/api/v1/pages/${pageId}/bot_field?access_token=${token.user}`, {
    headers: {
      accept: 'application/json'
    }
  }).then(response => response.json())
  console.log(json)
  return json.result.map(x => `{{${x.id}/|${x.name}}}`)
}

/**
 * @description 获取流程内容
 * @param {string|number} pageId - 专页ID
 * @param {string|number} flowId - 流程ID
 * @returns {Object} 返回流程的完整JSON数据
 */
async function getFlowContent (pageId, flowId) {
  const json = await fetch(`https://botcake.io/api/v1/pages/${pageId}/flow/${flowId}?access_token=${token.user}`, {
    headers: {
      accept: 'application/json'
    }
  }).then(response => response.json())
  return json
}

/**
 * @description 替换流程变量
 * @param {string|number} pageId - 专页 ID
 * @param {Object} flowContent - 原始流程的完整内容对象
 * @param {string[]} origFields - 原始专页字段
 * @param {string[]} targetFields - 目标专页字段
 * @returns {boolean} 请求状态
 */
async function replaceFlowVariable (pageId, flowContent, origFields, targetFields) {
  // 变量名称
  const flowName = flowContent.flow.name
  // 删除存档
  delete flowContent.flow.drafts
  // 设置发布时间
  flowContent.flow.published_at = new Date().toISOString().replace(/.....$/g, '')

  let obj = flowContent.flow
  for (let i = 0; i < origFields.length; i++) {
    const origFieldName = origFields[i].replace(/.+\/\|/g, '')
    // 查找对应字段
    const matchedField = targetFields.filter(field => field.includes(origFieldName))[0]
    // 替换变量字段
    obj = deepReplaceText(obj, origFields[i], matchedField)
    // obj = deepReplaceText(obj, origFields[i], targetFields[i])
  }

  // 设置流程
  const body = new FormData()
  body.append('post', JSON.stringify(obj))
  body.append('is_preview', false)
  body.append('name', flowName)
  body.append('is_preview_published', false)
  body.append('selected_tab', 'flows')

  const json = await fetch(`https://botcake.io/api/v1/pages/${pageId}/save_contents?access_token=${token.user}`, {
    headers: {
      accept: 'application/json'
    },
    body,
    method: 'POST',
    mode: 'cors',
    credentials: 'include'
  }).then(response => response.json())
  return json.success
}

/**
 * @description 替换流程标签
 * @param {string|number} pageId - 专页 ID
 * @param {Object} flowContent - 原始流程的完整内容对象
 * @param {Array} tags - 标签
 * @returns {boolean} 请求状态
 */
async function replaceFlowTag (pageId, flowContent, tags) {
  // 变量名称
  const flowName = flowContent.flow.name
  // 删除存档
  delete flowContent.flow.drafts
  // 设置发布时间
  flowContent.flow.published_at = new Date().toISOString().replace(/.....$/g, '')

  let obj = flowContent.flow
  for (let i = 0; i < tags.length; i++) {
    // 替换变量字段
    obj = deepReplaceText(obj, tags[i].old_id, tags[i].id)
    // obj = deepReplaceText(obj, origFields[i], targetFields[i])
  }

  // 设置流程
  const body = new FormData()
  body.append('post', JSON.stringify(obj))
  body.append('is_preview', false)
  body.append('name', flowName)
  body.append('is_preview_published', false)
  body.append('selected_tab', 'flows')

  const json = await fetch(`https://botcake.io/api/v1/pages/${pageId}/save_contents?access_token=${token.user}`, {
    headers: {
      accept: 'application/json'
    },
    body,
    method: 'POST',
    mode: 'cors',
    credentials: 'include'
  }).then(response => response.json())
  return json.success
}

/**
 * @description 开启关键词
 * @param {(string|number)} pageId - 专页 ID
 * @returns {boolean} 替换状态
 */
async function enableKeywords (pageId) {
  // 获取关键词列表
  const json = await fetch(`https://botcake.io/api/v1/pages/${pageId}/keywords?for_page=false&for_comment=false&page_size=20&page=1&access_token=${token.user}`, {
    headers: {
      accept: 'application/json'
    }
  }).then(response => response.json())
  // 解析关键词 ID
  const keywordList = json.keywords.map(x => x.id)

  for (const keywordId of keywordList) {
    // 开启关键词
    const body = new FormData()
    body.append('keyword_id', keywordId)
    body.append('is_activated', false)
    const json = await fetch(`https://botcake.io/api/v1/pages/${pageId}/keywords/${keywordId}?access_token=${token.user}`, {
      headers: {
        accept: 'application/json'
      },
      body,
      method: 'POST',
      credentials: 'include'
    }).then(response => response.json())
    if (!json.success) {
      return false
    }
  }
  return true
}

/**
 * @description 开启用户评论自动回复
 * @param {(string|number)} pageId - 专页 ID
 * @returns {boolean} 请求状态
 */
async function enableAutoReplyOnComment (pageId) {
  const body = new FormData()
  body.append('changes[auto_reply_comment]', 'true')
  const json = await fetch(`https://botcake.io/api/v1/pages/${pageId}/settings?access_token=${token.user}`, {
    headers: {
      accept: 'application/json'
    },
    body,
    method: 'POST',
    credentials: 'include'
  }).then(response => response.json())
  return json.success
}

/**
 * @description 开启用户评论自动发消息
 * @param {(string|number)} pageId - 专页 ID
 * @returns {boolean} 请求状态
 */
async function enableAutoInboxOnComment (pageId) {
  const body = new FormData()
  body.append('changes[inbox_from_comment]', 'true')
  const json = await fetch(`https://botcake.io/api/v1/pages/${pageId}/settings?access_token=${token.user}`, {
    headers: {
      accept: 'application/json'
    },
    body,
    method: 'POST',
    credentials: 'include'
  }).then(response => response.json())
  return json.success
}

/**
 * @description 开启仅限第一次评论
 * @param {(string|number)} pageId - 专页 ID
 * @returns {boolean} 请求状态
 */
async function enableOnlyFirstComment (pageId) {
  const body = new FormData()
  body.append('changes[only_reply_first_comment]', 'true')
  const json = await fetch(`https://botcake.io/api/v1/pages/${pageId}/settings?access_token=${token.user}`, {
    headers: {
      accept: 'application/json'
    },
    body,
    method: 'POST',
    credentials: 'include'
  }).then(response => response.json())
  return json.success
}

/**
 * @description 开启小组用户评论自动发消息
 * @param {(string|number)} pageId - 专页 ID
 * @returns {boolean} 请求状态
 */
async function enableAutoCommentInGroup (pageId) {
  const body = new FormData()
  body.append('changes[auto_comment_in_group]', 'true')
  const json = await fetch(`https://botcake.io/api/v1/pages/${pageId}/settings?access_token=${token.user}`, {
    headers: {
      accept: 'application/json'
    },
    body,
    method: 'POST',
    credentials: 'include'
  }).then(response => response.json())
  return json.success
}

/**
 * @description 开启仅回复一级评论
 * @param {(string|number)} pageId - 专页 ID
 * @returns {boolean} 请求状态
 */
async function enableAutoReplyFirstComment (pageId) {
  const body = new FormData()
  body.append('changes[only_track_first_level_comment]', 'true')
  const json = await fetch(`https://botcake.io/api/v1/pages/${pageId}/settings?access_token=${token.user}`, {
    headers: {
      accept: 'application/json'
    },
    body,
    method: 'POST',
    credentials: 'include'
  }).then(response => response.json())
  return json.success
}

/**
 * @description 删除旧数据
 * @param {(number|string)} pageId - 专页 ID
 */
async function cleanOldData (pageId) {
  log('正在获取原始流程 ID')
  const flowIds = await getFlowId(pageId)
  const trashFlowIds = await getFlowId(pageId, true)
  /**
   * @description 删除流程
   * @param {string|number} flowId - 流程ID
   * @returns {boolean} 请求状态
   */
  async function deleteFlow (flowId) {
    if (!flowId) return
    const json = await fetch(`https://botcake.io/api/v1/pages/${pageId}/flow/${flowId}?access_token=${token.user}`, {
      headers: {
        accept: 'application/json'
      },
      method: 'DELETE',
      credentials: 'include'
    }).then(response => response.json())
    return json.success
  }
  // 获取关键词列表
  async function getKeywordList () {
    const json = await fetch(`https://botcake.io/api/v1/pages/${pageId}/keywords?for_page=false&for_comment=false&page_size=20&page=1&access_token=${token.user}`, {
      headers: {
        accept: 'application/json'
      }
    }).then(response => response.json())
    // 解析关键词 ID
    const keywordList = json.keywords.map(x => x.id)
    return keywordList
  }
  /**
   * @description 删除关键词
   * @param {string|number} flowId - 流程ID
   * @returns {boolean} 请求状态
   */
  async function deleteKeyword (keywordId) {
    if (!keywordId) return
    const json = await fetch(`https://botcake.io/api/v1/pages/${pageId}/keywords/${keywordId}?access_token=${token.user}`, {
      headers: {
        accept: 'application/json'
      },
      method: 'DELETE',
      credentials: 'include'
    }).then(response => response.json())
    return json.success
  }
  // 恢复默认回复
  async function defaultReply () {
    const body = new FormData()
    body.append('type', 'defaults')
    const json = await fetch(`https://botcake.io/api/v1/pages/${pageId}/replace?access_token=${token.user}`, {
      headers: {
        accept: 'application/json'
      },
      body,
      method: 'POST',
      credentials: 'omit'
    }).then(response => response.json())
    return json.success
  }

  // 删除默认回复流程
  const result = await defaultReply()
  if (result) {
    log('✅ 删除默认回复流程成功')
  } else {
    log('❌ 删除默认回复流程失败')
  }
  // 合并流程 ID
  const mergeFlowId = [flowIds, trashFlowIds].flat()
  let deleteFlowResult = 0
  // 删除全部流程
  for (const flowId of mergeFlowId) {
    const result = await deleteFlow(flowId)
    console.log('删除流程', flowId, result)
    if (!result) deleteFlowResult++
  }
  console.log('deleteFlowResult', deleteFlowResult)
  if (deleteFlowResult === 0) {
    log('✅ 删除流程成功')
  } else {
    log('❌ 删除流程失败')
  }

  let deleteKeywordResult = 0
  const keywordList = await getKeywordList()
  for (const keywordId of keywordList) {
    const result = await deleteKeyword(keywordId)
    console.log('删除关键词', keywordId, result)
    if (!result) result++
  }
  console.log('deleteKeywordResult', deleteKeywordResult)
  if (deleteKeywordResult === 0) {
    log('✅ 删除流程成功')
  } else {
    log('❌ 删除流程失败')
  }
  log('✅ 旧设置全部处理完成，开始复制流程')
}

/**
 * @description 获取标签列表
 * @param {(number|string)} pageId - 专页 ID
 */
async function getTagIds (pageId) {
  const json = await fetch(`https://botcake.io/api/v1/pages/${pageId}/tags?access_token=${token.user}`, {
    headers: {
      accept: 'application/json'
    },
    method: 'GET',
    credentials: 'include'
  }).then(response => response.json())
  return json
}
