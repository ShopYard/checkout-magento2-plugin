define ([
	'Df_Payment/js/view/payment/cc-form'
	,'jquery'
	, 'df'
	, 'Df_Checkout/js/data'
	, 'mage/translate'
	, 'underscore'
	, 'Df_Checkout/js/action/place-order'
	, 'Magento_Checkout/js/model/payment/additional-validators'
	, 'Magento_Checkout/js/model/quote'
	, 'Df_Checkout/js/action/redirect-on-success'
], function(
	Component, $, df, dfCheckout, $t, _,
	placeOrderAction, additionalValidators, quote, redirectOnSuccessAction
) {
	'use strict';
	return Component.extend({
		defaults: {clientConfig: {id: 'dfe-checkout-com'}},
		/**
		 * 2016-07-16
		 * http://docs.checkout.com/getting-started/testing-and-simulating-charges#response-codes
		 * @override
		 * @see mage2pro/core/Payment/view/frontend/web/js/view/payment/mixin.js
		 * @returns {String}
		 */
		debugMessage: function() {
			if (df.undefined(this._debugMessage)) {
				/** @type {String} */
				var amountS = Math.round(100 * dfCheckout.grandTotal()).toString();
				/** @type {String} */
				var last2 = amountS.substring(amountS.length - 2);
				/** @type {?String} */
				var reason = ({
					'05': '	Declined - Do Not Honour'
					,'12': 'Invalid Transaction'
					,'14': 'Invalid Card Number'
					,'51': 'Insufficient Funds'
					,'62': 'Restricted Card'
					,'63': 'Security Violation'
				})[last2];
				this._debugMessage = !reason ? '' :
					('The transaction will <b><a href="{url}">fail</a></b> by the reason of «<b>{reason}</b>», '
					 + 'because the payment amount ends with «<b>{last2}</b>».')
						.replace('{url}', 'http://docs.checkout.com/getting-started/testing-and-simulating-charges#response-codes')
						.replace('{reason}', reason)
						.replace('{last2}', last2)
				;
			}
			return this._debugMessage;

		},
		/**
		 * 2016-05-18
		 * @returns {String[]}
	 	 */
		getCardTypes: function() {return ['VI', 'MC', 'AE'];},
		/**
		 * 2016-03-06
   		 * @override
   		 */
		getData: function() {
			return {
				/**
				 * 2016-05-03
				 * If «token» is not included in «additional_data»,
				 * we get the below error:
				 * «Property "Token" does not have corresponding setter
				 * in class "Magento\Quote\Api\Data\PaymentInterface»
				 */
				additional_data: {token: this.token}
				,method: this.item.method
			};
		},
		/**
		 * 2016-05-04
		 * We have overriden the parent method,
		 * to use our placeOrderAction instead of the parent's.
		 * @override
		 * https://github.com/magento/magento2/blob/981d1f/app/code/Magento/Checkout/view/frontend/web/js/view/payment/default.js#L161-L165
		 * @return {jQuery.Deferred}
		*/
		getPlaceOrderDeferredObject: function() {
			return $.when(placeOrderAction(this.getData(), this.messageContainer, 'dfe-checkout-com'));
		},
		/**
		 * 2016-03-08
		 * @return {String}
		*/
		getTitle: function() {
			var result = this._super();
			return result + (!this.isTest() ? '' : ' [<b>Checkout.com TEST MODE</b>]');
		},
		/**
		 * 2016-03-02
		 * @return {Object}
		*/
		initialize: function() {
			this._super();
			/**
			 * 2016-06-01
			 * To note: anonymous user can change his email.
			 * We should then only initiate CheckoutKit
			 * when the buyer clicks the "Place Order" button
			 */
			// 2016-04-14
			// http://docs.checkout.com/getting-started/checkoutkit-js
			this.initDf();
			// 2016-03-09
			// «Mage2.PRO» → «Payment» → «Checkout.com» → «Prefill the Payment Form with Test Data?
			/** @type {String|Boolean} */
			var prefill = this.config('prefill');
			if ($.isPlainObject(prefill)) {
				this.creditCardNumber(prefill['number']);
				this.creditCardExpMonth(prefill['expiration-month']);
				this.creditCardExpYear(prefill['expiration-year']);
				this.creditCardVerificationNumber(prefill['cvv']);
			}
			return this;
		},
		/**
		 * 2016-03-08
		 * @return {Promise}
		*/
		initDf: function() {
			if (df.undefined(this._initDf)) {
				/** @type {Deferred} */
				var deferred = $.Deferred();
				var _this = this;
				window.CKOConfig = {
					/**
					 * 2016-04-20
					 * This flag only triggers showing debugging messages in the console
					 *
					 * «Setting debugMode to true is highly recommended during the integration process;
					 * the browser’s console will display helpful information
					 * such as key events including event data and/or any issues found.»
					 * http://docs.checkout.com/getting-started/checkoutkit-js
					 *
					 * http://docs.checkout.com/reference/checkoutkit-js-reference/actions
					 * «The log action will only log messages on the console if debugMode is set to true.»
					 */
					debugMode: this.isTest()
					,publicKey: this.config('publishableKey')
					//,customerEmail: dfCheckout.email()
					,ready: function(event) {
						// 2016-04-14
						// http://docs.checkout.com/getting-started/checkoutkit-js/charge-via-card-token#step-2-capture-and-send-credit-card-details
						//CheckoutKit.monitorForm('form.dfe-checkout-com', CheckoutKit.CardFormModes.CARD_TOKENISATION);
						/**
						 * 2016-04-20
						 * http://docs.checkout.com/reference/checkoutkit-js-reference/handlers
						 * @type {*|Array}
						 */
						var ev = CheckoutKit.Events;
						/**
						 * 2016-04-20
						 * «If you do not want the <form> to be submitted automatically,
						 * you can add an event listener to receive the card token.»
						 * http://docs.checkout.com/getting-started/checkoutkit-js/charge-via-card-token#step-2-capture-and-send-credit-card-details
						 *
						 * http://docs.checkout.com/getting-started/checkoutkit-js/charge-via-card-token#example
						 * CARD_TOKENISED
						 * After a card is tokenised.
						 * The event object will contain the card token.
						 * Example: {id: 'card_tok_111'}
						 */
						CheckoutKit.addEventHandler(ev.CARD_TOKENISED, function(event) {
						    console.log('card token', event.data.id);
							_this.token = event.data.id;
							_this.placeOrder();
						});
						/**
						 * 2016-04-20
						 * http://docs.checkout.com/reference/checkoutkit-js-reference/handlers
						 */
						CheckoutKit.addEventHandler(ev.CARD_TOKENISATION_FAILED, function(event) {
							_this.messageContainer.addErrorMessage({
								'message': $t('The card tokenisation fails.')
							});
						});
						deferred.resolve();
					}
					,apiError: function(event) {
						deferred.reject();
					}
				};
				/** @type {String} */
				var library = 'Dfe_CheckoutCom/API/' + (this.isTest() ? 'Sandbox' : 'Production');
				require.undef(library);
				delete window.CheckoutKit;
				// 2016-04-11
				// CheckoutKit не использует AMD и прикрепляет себя к window.
				require([library], function() {});
				this._initDf = deferred.promise();
			}
			return this._initDf;
		},
		pay: function() {
			var _this = this;
			this.initDf().done(function() {
				/**
				 * 2016-04-21
				 * http://docs.checkout.com/reference/checkoutkit-js-reference/actions#create-card-token
				 */
				CheckoutKit.createCardToken({
					cvv: _this.dfCardVerification()
					,expiryMonth: _this.dfCardExpirationMonth()
					,expiryYear: _this.dfCardExpirationYear()
					,number: _this.dfCardNumber()
					/**
					 * 2016-04-14
					 * «Charges Required-Field Matrix»
					 * http://developers.checkout.com/docs/server/integration-guide/charges#a1
					 * http://docs.checkout.com/reference/merchant-api-reference/charges/charge-with-card-token
					 *
					 * 2016-04-17
					 * How to get the current customer's email on the frontend checkout screen?
					 * https://mage2.pro/t/1295
					 */
					,'email-address': dfCheckout.email()
				}, function(response) {
					_this.token = response.id;
					_this.placeOrder();
				});
			});
		},
		/**
		 * 2016-05-04
		 * @override
		 * https://github.com/magento/magento2/blob/981d1f/app/code/Magento/Checkout/view/frontend/web/js/view/payment/default.js#L127-L159
		 * @return {Boolean}
		*/
		placeOrder: function(data, event) {
			var _this = this;
			if (event) {
				event.preventDefault();
			}
			/** @type {Boolean} */
			var result = this.validate() || additionalValidators.validate();
			if (result) {
				this.isPlaceOrderActionAllowed(false);
				this.getPlaceOrderDeferredObject()
					.fail(function() {_this.isPlaceOrderActionAllowed(true);})
					.done(
						function(redirectUrl) {
							/**
							 * 2016-05-04
							 * Redirect to do a 3D-Secure verification.
							 * Similar to: redirectOnSuccessAction.execute()
							 * https://github.com/magento/magento2/blob/8fd3e8/app/code/Magento/Checkout/view/frontend/web/js/action/redirect-on-success.js#L19-L19
							 *
							 * 2016-05-09
							 * If 3D-Secure is not necessary,
							 * Method @see \Dfe\CheckoutCom\PlaceOrder::response() returns null:
							 * https://code.dmitry-fedyuk.com/m2e/checkout.com/blob/f4acf4a3/PlaceOrder.php#L58
							 * which is then converted by
							 * @see \Magento\Framework\Webapi\ServiceOutputProcessor::process()
							 * to an empty array:
							 * «A Web API request returns an empty array for a null response»
							 * https://mage2.pro/t/1569
							 *
							 * When there is no need to do a 3D-Secure verification,
							 * the value of redirectUrl will be an empty array.
							 * So the correct test to be done is: if (redirectUrl),
							 * and if (redirectUrl.length)
							 * In all cases, we want to cope with the possibility of
							 * Magento core unexpectedly returning null.
							 */
							if (redirectUrl && redirectUrl.length) {
								window.location.replace(redirectUrl);
							}
							else if (_this.redirectAfterPlaceOrder) {
								redirectOnSuccessAction.execute();
							}
						}
					)
				;
			}
			return result;
		}
	});
});
