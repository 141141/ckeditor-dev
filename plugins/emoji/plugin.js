/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/* jshint -W100 */

( function() {
	'use strict';

	CKEDITOR.plugins.add( 'emoji', {
		requires: 'autocomplete,textmatch,ajax',
		icons: 'emojipanel',
		beforeInit: function() {
			CKEDITOR.document.appendStyleSheet( this.path + 'skins/default.css' );
		},

		init: function( editor ) {
			if ( CKEDITOR.env.ie && CKEDITOR.env.version < 9 ) {
				return;
			}

			var emojiListUrl = editor.config.emoji_emojiListUrl || 'plugins/emoji/emoji.json',
				lang = editor.lang.emoji,
				defaultEmojiList = null;

			CKEDITOR.ajax.load( CKEDITOR.getUrl( emojiListUrl ), function( data ) {
				if ( data === null ) {
					return;
				}

				defaultEmojiList = JSON.parse( data );

				if ( !editor._.emojiList ) {
					editor._.emojiList = defaultEmojiList;
				}
				var emoji = editor._.emojiList,
					forbiddenScope = editor.config.emoji_blacklistedElements || [ 'pre', 'code' ],
					charactersToStart = editor.config.emoji_minChars || 2;

				var filter = new CKEDITOR.htmlParser.filter( {
					text: function( value, element ) {
						var preventEmojiConversion = element.getAscendant( hasForbiddenParent );
						if ( preventEmojiConversion ) {
							return value;
						}
						var hits = value.match( /:[a-zA-Z_-]+?:/g );
						if ( hits ) {
							for ( var i = 0; i < hits.length; i++ ) {
								var item = emoji.find( function( element ) {
									return element.id === hits[ i ];
								} );
								if ( item ) {
									value = value.replace( item.id, item.symbol );
								}
							}
						}
						return value;
					}
				} );

				editor.on( 'toHtml', function( evt ) {
					var sel = evt.editor.getSelection();
					// We want to prevent embedding emoji inside wrong context, e.g. paste :emoji: inside <pre>
					if ( sel && !isEmojiAllowed( sel.getRanges()[ 0 ] ) ) {
						return;
					}

					filter.applyTo( evt.data.dataValue );
				} );

				var html = CKEDITOR.htmlParser.fragment.fromHtml( editor.getData() );
				var writer = new CKEDITOR.htmlParser.basicWriter();

				filter.applyTo( html );
				html.writeHtml( writer );

				if ( editor.status !== 'ready' ) {
					editor.once( 'instanceReady', function() {
						initEmojiPlugin( writer );
					} );
				} else {
					initEmojiPlugin( writer );
				}

				function initEmojiPlugin( writer ) {
					new CKEDITOR.plugins.autocomplete( editor, {
						textTestCallback: getTextTestCallback(),
						dataCallback: dataCallback,
						itemTemplate: '<li data-id="{id}" class="cke_emoji_suggestion_item">{symbol} {id}</li>',
						outputTemplate: '{symbol}'
					} );

					// Replace startup emoji
					editor.editable().setHtml( writer.getHtml() );

					// Synchronize undo.
					if ( editor.undoManager && editor.undoManager.snapshots.length === 1 ) {
						editor.undoManager.update();
					}
				}

				function getTextTestCallback() {
					return function( range ) {
						if ( !range.collapsed || !isEmojiAllowed( range ) ) {
							return null;
						}
						return CKEDITOR.plugins.textMatch.match( range, matchCallback );
					};
				}

				function matchCallback( text, offset ) {
					var left = text.slice( 0, offset ),
						match = left.match( new RegExp( ':\\S{' + charactersToStart + '}\\S*$' ) );

					if ( !match ) {
						return null;
					}

					return { start: match.index, end: offset };
				}

				function dataCallback( query, range, callback ) {
					var data = CKEDITOR.tools.array.filter( emoji, function( item ) {
						return item.id.indexOf( query.slice( 1 ) ) !== -1;
					} ).sort( function( a, b ) {
						// Sort at the beginning emoji starts with given query.
						var emojiName = query.substr( 1 ),
							isAStartWithEmojiName = a.id.substr( 1, emojiName.length ) === emojiName,
							isBStartWithEmojiName = b.id.substr( 1, emojiName.length ) === emojiName;

						if ( isAStartWithEmojiName && isBStartWithEmojiName || !isAStartWithEmojiName && !isBStartWithEmojiName ) {
							return a.id === b.id ? 0 : ( a.id > b.id ? 1 : -1 );
						} else if ( isAStartWithEmojiName ) {
							return -1;
						} else {
							return 1;
						}
					} );
					callback( data );
				}

				function isEmojiAllowed( range ) {
					var elementsPath,
						editable = editor.editable();
					if ( range ) {
						elementsPath = new CKEDITOR.dom.elementPath( range.startContainer, editable );
						return elementsPath.contains( forbiddenScope ) ? false : true;
					} else {
						return true;
					}
				}

				function hasForbiddenParent( htmlParserNode ) {
					if ( htmlParserNode.type === CKEDITOR.NODE_TEXT ) {
						return false;
					}

					if ( htmlParserNode.name && CKEDITOR.tools.array.indexOf( forbiddenScope, htmlParserNode.name ) !== -1 ) {
						return true;
					} else {
						return false;
					}
				}
			} );

			editor.addCommand( 'insertEmoji', {
				exec: function( editor, data ) {
					editor.insertText( data.emojiName );
				}
			} );

			// Name is responsible for icon name also.
			editor.ui.add( 'emojiPanel', CKEDITOR.UI_PANELBUTTON, {
				label: 'emoji',
				title: 'Emoji List',
				modes: { wysiwyg: 1 },
				editorFocus: 0,
				toolbar: 'emoji',
				panel: {
					css: [ CKEDITOR.skin.getPath( 'editor' ), this.path + 'skins/default.css' ],
					attributes: { role: 'listbox', 'aria-label': 'Emoji List' }
				},

				onBlock: function( panel, block ) {
					block.element.addClass( 'cke_emoji_panel_block' );
					block.element.setHtml( getEmojiBlock() );
					panel.element.addClass( 'cke_emoji_panel' );

				}

			} );

			var clickFn = CKEDITOR.tools.addFunction( function( event ) {
				editor.insertText( ':' + event.target.dataset.ckeEmojiName + ':' );
			} );

			function getEmojiBlock() {
				var output = [];
				// Search Box:
				output.push( '<input type="search">' );
				// Result box:
				var resultTpl = new CKEDITOR.template( '<h2>{langTitle}</h2>' );
				var emojiTpl = new CKEDITOR.template( '<li data-cke-emoji-name="{id}" class="cke_emoji_item cke_emoji_item_active">{symbol}</li>' );
				output.push( resultTpl.output( { langTitle: lang ? lang.resultTitle : 'Frequently used' } ) );

				output.push( '<div class="cke_emoji_list"><ul onclick="CKEDITOR.tools.callFunction(', clickFn, ',event);return false;">' );
				CKEDITOR.tools.array.forEach( defaultEmojiList, function( emoji ) {
					output.push( emojiTpl.output( { symbol: emoji.symbol, id: emoji.id.replace( /^:|:$/g, '' ) } ) );
				} );
				output.push( '</ul></div>' );

				return '<div class="cke_emoji_inner_panel">' + output.join( '' ) + '</div>';
			}

		}
	} );
} )();


/**
 * Array with names of tags where emoji plugin remain inactive.
 *
 * ```js
 * 	editor.emoji_blacklistedElements = [ 'h1', 'h2' ];
 * ```
 *
 * @since 4.10.0
 * @cfg {String[]} [emoji_blacklistedElements = [ 'pre', 'code' ]]
 * @member CKEDITOR.config
 */

/**
 * Number which defines how many characters is required to start displaying emoji's autocomplete suggestion box.
 * Delimiter `:`, which activates emoji's suggestion box, is not included into this value.
 *
 * ```js
 * 	editor.emoji_minChars = 0; // Emoji suggestion box appear after typing ':'.
 * ```
 *
 * @since 4.10.0
 * @cfg {Number} [emoji_minChars = 2]
 * @member CKEDITOR.config
 */

/**
 * Address to JSON file containing emoji list. File is downloaded through {@link CKEDITOR.ajax#load} method
 * and URL address is processed by {@link CKEDITOR#getUrl}.
 * Emoji list has to be an array of objects with `id` and `symbol` property. Those keys represent text to match and UTF symbol for its replacement.
 * Emoji has to start with `:` (colon) symbol.
 * ```json
 * [
 * 	{
 * 		"id": ":grinning_face:",
 * 		"symbol":"😀"
 * 	},
 * 	{
 * 		"id": ":bug:",
 * 		"symbol":"🐛"
 * 	},
 * 	{
 * 		"id": ":star:",
 * 		"symbol":"⭐"
 * 	}
 * ]
 * ```
 *
 * ```js
 * 	editor.emoji_emojiListUrl = 'https://my.custom.domain/ckeditor/emoji.json';
 * ```
 *
 * @since 4.10.0
 * @cfg {String} [emoji_emojiListUrl = 'plugins/emoji/emoji.json']
 * @member CKEDITOR.config
 */
