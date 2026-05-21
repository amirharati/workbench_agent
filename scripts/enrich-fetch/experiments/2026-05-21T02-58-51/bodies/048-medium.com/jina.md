# Flutter Login with REST API and SQLITE using Blocs. | by Amartya Gaur | Flutter Community | Medium

[Sitemap](https://medium.com/sitemap/sitemap.xml)

[Open in app](https://play.google.com/store/apps/details?id=com.medium.reader&referrer=utm_source%3DmobileNavBar&source=post_page---top_nav_layout_nav-----------------------------------------)

Sign up

[Sign in](https://medium.com/m/signin?operation=login&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844&source=post_page---top_nav_layout_nav-----------------------global_nav------------------)

[](https://medium.com/?source=post_page---top_nav_layout_nav-----------------------------------------)

Get app

[Write](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fmedium.com%2Fnew-story&source=---top_nav_layout_nav-----------------------new_post_topnav------------------)

[Search](https://medium.com/search?source=post_page---top_nav_layout_nav-----------------------------------------)

Sign up

[Sign in](https://medium.com/m/signin?operation=login&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844&source=post_page---top_nav_layout_nav-----------------------global_nav------------------)

![Image 3: Unknown user](https://miro.medium.com/v2/resize:fill:64:64/1*dmbNkD5D-u45r44go_cf0g.png)

## [Flutter Community](https://medium.com/flutter-community?source=post_page---publication_nav-86fb29d7cc6a-61866fafc844---------------------------------------)

·
Follow publication

[![Image 4: Flutter Community](https://miro.medium.com/v2/resize:fill:76:76/1*nE4OFcqk2kx2-Lzhey8QKA.png)](https://medium.com/flutter-community?source=post_page---post_publication_sidebar-86fb29d7cc6a-61866fafc844---------------------------------------)
Articles and Stories from the Flutter Community

Follow publication

Member-only story

# Flutter Login with REST API and SQLITE using Blocs.

[![Image 5: Amartya Gaur](https://miro.medium.com/v2/da:true/resize:fill:64:64/0*xAu6aPX0Df6Mpn0r)](https://medium.com/@amarkaushik1999?source=post_page---byline--61866fafc844---------------------------------------)

[Amartya Gaur](https://medium.com/@amarkaushik1999?source=post_page---byline--61866fafc844---------------------------------------)

Follow

7 min read

·

May 21, 2020

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fvote%2Fflutter-community%2F61866fafc844&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844&user=Amartya+Gaur&userId=561a08521422&source=---header_actions--61866fafc844---------------------clap_footer------------------)

363

4

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F61866fafc844&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844&source=---header_actions--61866fafc844---------------------bookmark_footer------------------)

[Listen](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2Fplans%3Fdimension%3Dpost_audio_button%26postId%3D61866fafc844&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844&source=---header_actions--61866fafc844---------------------post_audio_button------------------)

Share

Press enter or click to view image in full size

![Image 6](https://miro.medium.com/v2/resize:fit:700/1*m-_w5yEFybfiWGMIpYER0g.jpeg)

## What is this post about?

This post is about creating a flutter login working with an API, I made the API in Django with the help of DRF (please read them: [post #1](https://dev.to/amartyadev/flutter-app-authentication-with-django-backend-1-21cp), [post #2](https://dev.to/amartyadev/flutter-signup-login-application-with-django-backend-2-4kn5) before this post in case you want to develop the API as well). This post will be about the flutter application that will function with that API. We are going to create an application to allow a user to log in and log out.

You can also view the source code at [this repo](https://github.com/amartya-dev/flutter-bloc/tree/master/bloc_login).

## Pre-requisites

To follow along with the post, you need to have flutter installed (refer: [https://flutter.dev/docs/get-started/install](https://flutter.dev/docs/get-started/install)) along with visual studio code and the extension for flutter (refer: [https://flutter.dev/docs/development/tools/vs-code](https://flutter.dev/docs/development/tools/vs-code)) and bloc (refer: [https://marketplace.visualstudio.com/items?itemName=FelixAngelov.bloc](https://marketplace.visualstudio.com/items?itemName=FelixAngelov.bloc)).

## Let’s Code

Begin with creating a project (it would be better to use the vscode extension for the same) called bloc_login (Ctrl + shift + p, type flutter and you will…

## Create an account to read the full story.

The author made this story available to Medium members only.

If you’re new to Medium, create a new account to read this story on us.

[Continue in app](https://play.google.com/store/apps/details?id=com.medium.reader&referrer=utm_source%3Dregwall&source=-----61866fafc844---------------------post_regwall------------------)

Or, continue in mobile web

[Sign up with Google](https://medium.com/m/connect/google?state=google-%7Chttps%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844%3Fsource%3D-----61866fafc844---------------------post_regwall------------------%26skipOnboarding%3D1%7Cregister%7Cremember_me&source=-----61866fafc844---------------------post_regwall------------------)

[Sign up with Facebook](https://medium.com/m/connect/facebook?state=facebook-%7Chttps%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844%3Fsource%3D-----61866fafc844---------------------post_regwall------------------%26skipOnboarding%3D1%7Cregister%7Cremember_me&source=-----61866fafc844---------------------post_regwall------------------)

Sign up with email

Already have an account? [Sign in](https://medium.com/m/signin?operation=login&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844&source=-----61866fafc844---------------------post_regwall------------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fvote%2Fflutter-community%2F61866fafc844&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844&user=Amartya+Gaur&userId=561a08521422&source=---footer_actions--61866fafc844---------------------clap_footer------------------)

363

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fvote%2Fflutter-community%2F61866fafc844&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844&user=Amartya+Gaur&userId=561a08521422&source=---footer_actions--61866fafc844---------------------clap_footer------------------)

363

4

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F61866fafc844&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844&source=---footer_actions--61866fafc844---------------------bookmark_footer------------------)

[![Image 7: Flutter Community](https://miro.medium.com/v2/resize:fill:96:96/1*nE4OFcqk2kx2-Lzhey8QKA.png)](https://medium.com/flutter-community?source=post_page---post_publication_info--61866fafc844---------------------------------------)

[![Image 8: Flutter Community](https://miro.medium.com/v2/resize:fill:128:128/1*nE4OFcqk2kx2-Lzhey8QKA.png)](https://medium.com/flutter-community?source=post_page---post_publication_info--61866fafc844---------------------------------------)

Follow

## [Published in Flutter Community](https://medium.com/flutter-community?source=post_page---post_publication_info--61866fafc844---------------------------------------)

[71K followers](https://medium.com/flutter-community/followers?source=post_page---post_publication_info--61866fafc844---------------------------------------)

·[Last published May 13, 2026](https://medium.com/flutter-community/how-a-two-year-old-firebase-mistake-led-to-a-3-167-ai-bill-overnight-89adfab1dad3?source=post_page---post_publication_info--61866fafc844---------------------------------------)

Articles and Stories from the Flutter Community

Follow

[![Image 9: Amartya Gaur](https://miro.medium.com/v2/resize:fill:96:96/0*xAu6aPX0Df6Mpn0r)](https://medium.com/@amarkaushik1999?source=post_page---post_author_info--61866fafc844---------------------------------------)

[![Image 10: Amartya Gaur](https://miro.medium.com/v2/resize:fill:128:128/0*xAu6aPX0Df6Mpn0r)](https://medium.com/@amarkaushik1999?source=post_page---post_author_info--61866fafc844---------------------------------------)

Follow

## [Written by Amartya Gaur](https://medium.com/@amarkaushik1999?source=post_page---post_author_info--61866fafc844---------------------------------------)

[45 followers](https://medium.com/@amarkaushik1999/followers?source=post_page---post_author_info--61866fafc844---------------------------------------)

·[2 following](https://medium.com/@amarkaushik1999/following?source=post_page---post_author_info--61866fafc844---------------------------------------)

Amartya Gaur I am a machine learning enthusiast and an experienced Django developer

Follow

## Responses (4)

[](https://policy.medium.com/medium-rules-30e5502c4eb4?source=post_page---post_responses--61866fafc844---------------------------------------)

![Image 11: Unknown user](https://miro.medium.com/v2/resize:fill:32:32/1*dmbNkD5D-u45r44go_cf0g.png)

Write a response

[What are your thoughts?](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844&source=---post_responses--61866fafc844---------------------respond_sidebar------------------)

Cancel

Respond

[![Image 12: Sandeep Chandra](https://miro.medium.com/v2/resize:fill:32:32/1*izQOeFvo7KI0rGnD2rIB6g.jpeg)](https://medium.com/@sandeep-chandra-88275?source=post_page---post_responses--61866fafc844----0-----------------------------------)

[Sandeep Chandra](https://medium.com/@sandeep-chandra-88275?source=post_page---post_responses--61866fafc844----0-----------------------------------)

[Nov 23, 2020](https://sandeep-chandra-88275.medium.com/hi-79269af6cc9d?source=post_page---post_responses--61866fafc844----0-----------------------------------)

Hi

I am a newbie so I have a basic question

For a simple app where nothing can happen unless a user logs in, is it still important to have state management (and therefore BLOCs) ?

I find the code you show is great till the BLOCs business which seems…more

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fvote%2Fp%2F79269af6cc9d&operation=register&redirect=https%3A%2F%2Fsandeep-chandra-88275.medium.com%2Fhi-79269af6cc9d&user=Sandeep+Chandra&userId=db38feb7103e&source=---post_responses--79269af6cc9d----0-----------------respond_sidebar------------------)

--

1 reply

Reply

[![Image 13: Nosakharee](https://miro.medium.com/v2/resize:fill:32:32/0*k9QbP74UjzHfwo8U)](https://medium.com/@nosakharee16?source=post_page---post_responses--61866fafc844----1-----------------------------------)

[Nosakharee](https://medium.com/@nosakharee16?source=post_page---post_responses--61866fafc844----1-----------------------------------)

[Jan 4, 2021](https://medium.com/@nosakharee16/do-you-have-a-video-on-this-i-got-lost-all-the-way-at-first-it-was-easy-and-going-well-47eaa9775da2?source=post_page---post_responses--61866fafc844----1-----------------------------------)

Do you have a video on this, I got lost all the way, at first it was easy and going well

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fvote%2Fp%2F47eaa9775da2&operation=register&redirect=https%3A%2F%2Fmedium.com%2F%40nosakharee16%2Fdo-you-have-a-video-on-this-i-got-lost-all-the-way-at-first-it-was-easy-and-going-well-47eaa9775da2&user=Nosakharee&userId=d6ab4301e1fe&source=---post_responses--47eaa9775da2----1-----------------respond_sidebar------------------)

--

Reply

[![Image 14: ipoool ಠ_ಠ](https://miro.medium.com/v2/resize:fill:32:32/1*jP_kAbOeC7Ccyx3mV7YvMQ.png)](https://medium.com/@ipoool?source=post_page---post_responses--61866fafc844----2-----------------------------------)

[ipoool ಠ_ಠ](https://medium.com/@ipoool?source=post_page---post_responses--61866fafc844----2-----------------------------------)

[Oct 31, 2020](https://medium.com/@ipoool/i-tried-following-your-code-and-i-have-question-why-after-logout-i-never-redirect-to-login-page-2fd9840b038d?source=post_page---post_responses--61866fafc844----2-----------------------------------)

I tried following your code and I have question, why after logout. I never redirect to Login Page?

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fvote%2Fp%2F2fd9840b038d&operation=register&redirect=https%3A%2F%2Fmedium.com%2F%40ipoool%2Fi-tried-following-your-code-and-i-have-question-why-after-logout-i-never-redirect-to-login-page-2fd9840b038d&user=ipoool+%E0%B2%A0_%E0%B2%A0&userId=ff666ee5a2b2&source=---post_responses--2fd9840b038d----2-----------------respond_sidebar------------------)

--

1 reply

Reply

See all responses

## More from Amartya Gaur and Flutter Community

![Image 15: Why I Combine Django ORM with FastAPI to Build AI-Friendly Backends Faster](https://miro.medium.com/v2/resize:fit:679/format:webp/1*F5CgZ86_xV2o01HUGIK2Sw.png)

[![Image 16: Amartya Gaur](https://miro.medium.com/v2/resize:fill:20:20/0*xAu6aPX0Df6Mpn0r)](https://medium.com/@amarkaushik1999?source=post_page---author_recirc--61866fafc844----0---------------------360f8982_b130_47b1_b563_a0283ece1e70--------------)

[Amartya Gaur](https://medium.com/@amarkaushik1999?source=post_page---author_recirc--61866fafc844----0---------------------360f8982_b130_47b1_b563_a0283ece1e70--------------)

·

Apr 16

## [Why I Combine Django ORM with FastAPI to Build AI-Friendly Backends Faster ### If you have ever felt torn between Django and FastAPI, I think the best answer might be: use both.](https://medium.com/@amarkaushik1999/why-i-combine-django-orm-with-fastapi-to-build-ai-friendly-backends-faster-e5eaa4ab6e2c?source=post_page---author_recirc--61866fafc844----0---------------------360f8982_b130_47b1_b563_a0283ece1e70--------------)

[](https://medium.com/@amarkaushik1999/why-i-combine-django-orm-with-fastapi-to-build-ai-friendly-backends-faster-e5eaa4ab6e2c?source=post_page---author_recirc--61866fafc844----0---------------------360f8982_b130_47b1_b563_a0283ece1e70--------------)

[](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844&source=---author_recirc--61866fafc844----0-----------------explicit_signal----360f8982_b130_47b1_b563_a0283ece1e70--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2Fe5eaa4ab6e2c&operation=register&redirect=https%3A%2F%2Fmedium.com%2F%40amarkaushik1999%2Fwhy-i-combine-django-orm-with-fastapi-to-build-ai-friendly-backends-faster-e5eaa4ab6e2c&source=---author_recirc--61866fafc844----0-----------------bookmark_preview----360f8982_b130_47b1_b563_a0283ece1e70--------------)

![Image 17: How a Two-Year-Old Firebase Mistake Led to a €3,167 AI Bill Overnight in my Flutter app](https://miro.medium.com/v2/resize:fit:679/format:webp/1*ZmHpisGwgl2TSVf10PCWNQ.png)

[![Image 18: Flutter Community](https://miro.medium.com/v2/resize:fill:20:20/1*nE4OFcqk2kx2-Lzhey8QKA.png)](https://medium.com/flutter-community?source=post_page---author_recirc--61866fafc844----1---------------------360f8982_b130_47b1_b563_a0283ece1e70--------------)

In

[Flutter Community](https://medium.com/flutter-community?source=post_page---author_recirc--61866fafc844----1---------------------360f8982_b130_47b1_b563_a0283ece1e70--------------)

by

[Cagatay Ulusoy](https://medium.com/@ulusoyca?source=post_page---author_recirc--61866fafc844----1---------------------360f8982_b130_47b1_b563_a0283ece1e70--------------)

·

May 13

## [How a Two-Year-Old Firebase Mistake Led to a €3,167 AI Bill Overnight in my Flutter app ### In April 2026, my Flutter app was featured in the Google Cloud Next’26 Developer Keynote in Las Vegas. Three weeks later, I woke up to find…](https://medium.com/flutter-community/how-a-two-year-old-firebase-mistake-led-to-a-3-167-ai-bill-overnight-89adfab1dad3?source=post_page---author_recirc--61866fafc844----1---------------------360f8982_b130_47b1_b563_a0283ece1e70--------------)

[3](https://medium.com/flutter-community/how-a-two-year-old-firebase-mistake-led-to-a-3-167-ai-bill-overnight-89adfab1dad3?source=post_page---author_recirc--61866fafc844----1---------------------360f8982_b130_47b1_b563_a0283ece1e70--------------)

[](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844&source=---author_recirc--61866fafc844----1-----------------explicit_signal----360f8982_b130_47b1_b563_a0283ece1e70--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F89adfab1dad3&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fhow-a-two-year-old-firebase-mistake-led-to-a-3-167-ai-bill-overnight-89adfab1dad3&source=---author_recirc--61866fafc844----1-----------------bookmark_preview----360f8982_b130_47b1_b563_a0283ece1e70--------------)

![Image 19: Flutter bloc for beginners](https://miro.medium.com/v2/resize:fit:679/format:webp/1*tCyuAc4DYm5jjQ-Maqii3A.png)

[![Image 20: Flutter Community](https://miro.medium.com/v2/resize:fill:20:20/1*nE4OFcqk2kx2-Lzhey8QKA.png)](https://medium.com/flutter-community?source=post_page---author_recirc--61866fafc844----2---------------------360f8982_b130_47b1_b563_a0283ece1e70--------------)

In

[Flutter Community](https://medium.com/flutter-community?source=post_page---author_recirc--61866fafc844----2---------------------360f8982_b130_47b1_b563_a0283ece1e70--------------)

by

[Ana Polo](https://medium.com/@ana-polo?source=post_page---author_recirc--61866fafc844----2---------------------360f8982_b130_47b1_b563_a0283ece1e70--------------)

·

Jan 7, 2022

## [Flutter bloc for beginners ### What is flutter bloc?](https://medium.com/flutter-community/flutter-bloc-for-beginners-839e22adb9f5?source=post_page---author_recirc--61866fafc844----2---------------------360f8982_b130_47b1_b563_a0283ece1e70--------------)

[32](https://medium.com/flutter-community/flutter-bloc-for-beginners-839e22adb9f5?source=post_page---author_recirc--61866fafc844----2---------------------360f8982_b130_47b1_b563_a0283ece1e70--------------)

[](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844&source=---author_recirc--61866fafc844----2-----------------explicit_signal----360f8982_b130_47b1_b563_a0283ece1e70--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F839e22adb9f5&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-bloc-for-beginners-839e22adb9f5&source=---author_recirc--61866fafc844----2-----------------bookmark_preview----360f8982_b130_47b1_b563_a0283ece1e70--------------)

![Image 21: Building a Dynamic MCP Proxy Server in Python](https://miro.medium.com/v2/resize:fit:679/format:webp/1*W5h6caO0BZNWZFCobfC6FA.png)

[![Image 22: Amartya Gaur](https://miro.medium.com/v2/resize:fill:20:20/0*xAu6aPX0Df6Mpn0r)](https://medium.com/@amarkaushik1999?source=post_page---author_recirc--61866fafc844----3---------------------360f8982_b130_47b1_b563_a0283ece1e70--------------)

[Amartya Gaur](https://medium.com/@amarkaushik1999?source=post_page---author_recirc--61866fafc844----3---------------------360f8982_b130_47b1_b563_a0283ece1e70--------------)

·

Feb 9

## [Building a Dynamic MCP Proxy Server in Python ### The Model Context Protocol (MCP) is rapidly becoming the standard for connecting AI models to external tools and data. As you start…](https://medium.com/@amarkaushik1999/building-a-dynamic-mcp-proxy-server-in-python-124df73a1f92?source=post_page---author_recirc--61866fafc844----3---------------------360f8982_b130_47b1_b563_a0283ece1e70--------------)

[](https://medium.com/@amarkaushik1999/building-a-dynamic-mcp-proxy-server-in-python-124df73a1f92?source=post_page---author_recirc--61866fafc844----3---------------------360f8982_b130_47b1_b563_a0283ece1e70--------------)

[](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844&source=---author_recirc--61866fafc844----3-----------------explicit_signal----360f8982_b130_47b1_b563_a0283ece1e70--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F124df73a1f92&operation=register&redirect=https%3A%2F%2Fmedium.com%2F%40amarkaushik1999%2Fbuilding-a-dynamic-mcp-proxy-server-in-python-124df73a1f92&source=---author_recirc--61866fafc844----3-----------------bookmark_preview----360f8982_b130_47b1_b563_a0283ece1e70--------------)

[See all from Amartya Gaur](https://medium.com/@amarkaushik1999?source=post_page---author_recirc--61866fafc844---------------------------------------)

[See all from Flutter Community](https://medium.com/flutter-community?source=post_page---author_recirc--61866fafc844---------------------------------------)

## Recommended from Medium

![Image 23: I Tried 100 Claude Skills. These Are The Best](https://miro.medium.com/v2/resize:fit:679/format:webp/1*oZUYCbcZzqxnO5WKLpaayw.png)

[![Image 24: Artificial Corner](https://miro.medium.com/v2/resize:fill:20:20/1*e1-WDgc0KCMKp_rHX9TyQQ.png)](https://medium.com/artificial-corner?source=post_page---read_next_recirc--61866fafc844----0---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

In

[Artificial Corner](https://medium.com/artificial-corner?source=post_page---read_next_recirc--61866fafc844----0---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

by

[The PyCoach](https://medium.com/@frank-andrade?source=post_page---read_next_recirc--61866fafc844----0---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

·

Apr 29

## [I Tried 100 Claude Skills. These Are The Best ### Tested, ranked, and ready to use](https://medium.com/artificial-corner/i-tried-100-claude-skills-these-are-the-best-047f0db71764?source=post_page---read_next_recirc--61866fafc844----0---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[49](https://medium.com/artificial-corner/i-tried-100-claude-skills-these-are-the-best-047f0db71764?source=post_page---read_next_recirc--61866fafc844----0---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844&source=---read_next_recirc--61866fafc844----0-----------------explicit_signal----f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F047f0db71764&operation=register&redirect=https%3A%2F%2Fmedium.com%2Fartificial-corner%2Fi-tried-100-claude-skills-these-are-the-best-047f0db71764&source=---read_next_recirc--61866fafc844----0-----------------bookmark_preview----f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

![Image 25: GoRouter Is in Maintenance Mode — Where Flutter Navigation Goes From Here](https://miro.medium.com/v2/resize:fit:679/format:webp/1*-qq6U0pLp0eWKoEJ3sCi2Q.png)

[![Image 26: Himanshu Sharma](https://miro.medium.com/v2/resize:fill:20:20/1*0VdvStMy8nRwTCYK7ewWlg.jpeg)](https://medium.com/@himanshusharma_4140?source=post_page---read_next_recirc--61866fafc844----1---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[Himanshu Sharma](https://medium.com/@himanshusharma_4140?source=post_page---read_next_recirc--61866fafc844----1---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

·

Apr 23

## [GoRouter Is in Maintenance Mode — Where Flutter Navigation Goes From Here ### I discovered the problem at 2 AM on a Tuesday, staring at production metrics that made no sense. Our Flutter app was performing…](https://medium.com/@himanshusharma_4140/gorouter-is-in-maintenance-mode-where-flutter-navigation-goes-from-here-5d5762c27a32?source=post_page---read_next_recirc--61866fafc844----1---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[10](https://medium.com/@himanshusharma_4140/gorouter-is-in-maintenance-mode-where-flutter-navigation-goes-from-here-5d5762c27a32?source=post_page---read_next_recirc--61866fafc844----1---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844&source=---read_next_recirc--61866fafc844----1-----------------explicit_signal----f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F5d5762c27a32&operation=register&redirect=https%3A%2F%2Fmedium.com%2F%40himanshusharma_4140%2Fgorouter-is-in-maintenance-mode-where-flutter-navigation-goes-from-here-5d5762c27a32&source=---read_next_recirc--61866fafc844----1-----------------bookmark_preview----f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

![Image 27: 📩 Integrating Firebase Cloud Messaging (FCM) in Flutter](https://miro.medium.com/v2/resize:fit:679/format:webp/0*4iuwN7R3jTDGaAVK.png)

[![Image 28: Rugved Apraj](https://miro.medium.com/v2/resize:fill:20:20/1*zxcC4CT1S1FzMWAw34aBmw.jpeg)](https://medium.com/@rugvedapraj?source=post_page---read_next_recirc--61866fafc844----0---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[Rugved Apraj](https://medium.com/@rugvedapraj?source=post_page---read_next_recirc--61866fafc844----0---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

·

Dec 15, 2025

## [📩 Integrating Firebase Cloud Messaging (FCM) in Flutter ### Firebase Cloud Messaging (FCM) allows Flutter apps to receive push notifications from a server or Firebase console. With FCM, you can…](https://medium.com/@rugvedapraj/integrating-firebase-cloud-messaging-fcm-in-flutter-a418cb602679?source=post_page---read_next_recirc--61866fafc844----0---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[](https://medium.com/@rugvedapraj/integrating-firebase-cloud-messaging-fcm-in-flutter-a418cb602679?source=post_page---read_next_recirc--61866fafc844----0---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844&source=---read_next_recirc--61866fafc844----0-----------------explicit_signal----f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2Fa418cb602679&operation=register&redirect=https%3A%2F%2Frugvedapraj.medium.com%2Fintegrating-firebase-cloud-messaging-fcm-in-flutter-a418cb602679&source=---read_next_recirc--61866fafc844----0-----------------bookmark_preview----f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

![Image 29: This One pubspec.yaml Change Cut My Flutter App Size by 40%](https://miro.medium.com/v2/resize:fit:679/format:webp/1*8OQTwF6sV2ZgUTI8moJCuw.png)

[![Image 30: Level Up Coding](https://miro.medium.com/v2/resize:fill:20:20/1*5D9oYBd58pyjMkV_5-zXXQ.jpeg)](https://medium.com/gitconnected?source=post_page---read_next_recirc--61866fafc844----1---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

In

[Level Up Coding](https://medium.com/gitconnected?source=post_page---read_next_recirc--61866fafc844----1---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

by

[Mohit Gupta](https://medium.com/@rishyash8?source=post_page---read_next_recirc--61866fafc844----1---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

·

May 5

## [This One pubspec.yaml Change Cut My Flutter App Size by 40% ### The platform-specific asset syntax shipped in Flutter 3.41 and every existing tutorial still shows the old workaround. Here’s the actual…](https://medium.com/gitconnected/this-one-pubspec-yaml-change-cut-my-flutter-app-size-by-40-ba040b9216bf?source=post_page---read_next_recirc--61866fafc844----1---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[1](https://medium.com/gitconnected/this-one-pubspec-yaml-change-cut-my-flutter-app-size-by-40-ba040b9216bf?source=post_page---read_next_recirc--61866fafc844----1---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844&source=---read_next_recirc--61866fafc844----1-----------------explicit_signal----f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2Fba040b9216bf&operation=register&redirect=https%3A%2F%2Flevelup.gitconnected.com%2Fthis-one-pubspec-yaml-change-cut-my-flutter-app-size-by-40-ba040b9216bf&source=---read_next_recirc--61866fafc844----1-----------------bookmark_preview----f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

![Image 31: Flutter Heatmaps with Microsoft Clarity SDK](https://miro.medium.com/v2/resize:fit:679/format:webp/1*5J8BRaQ0j4nukpIpDTcfzg.png)

[![Image 32: Enzo Lizama Paredes](https://miro.medium.com/v2/resize:fill:20:20/1*ooYNhXyByVIssgZu1teSGQ.jpeg)](https://medium.com/@enzoftware?source=post_page---read_next_recirc--61866fafc844----2---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[Enzo Lizama Paredes](https://medium.com/@enzoftware?source=post_page---read_next_recirc--61866fafc844----2---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

·

Feb 7

## [Flutter Heatmaps with Microsoft Clarity SDK ### Learn how to integrate Microsoft Clarity analytics into your Flutter application through session replays, heatmap, and interaction…](https://medium.com/@enzoftware/flutter-heatmaps-with-microsoft-clarity-sdk-0fe651e14898?source=post_page---read_next_recirc--61866fafc844----2---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[1](https://medium.com/@enzoftware/flutter-heatmaps-with-microsoft-clarity-sdk-0fe651e14898?source=post_page---read_next_recirc--61866fafc844----2---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844&source=---read_next_recirc--61866fafc844----2-----------------explicit_signal----f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2F0fe651e14898&operation=register&redirect=https%3A%2F%2Fmedium.com%2F%40enzoftware%2Fflutter-heatmaps-with-microsoft-clarity-sdk-0fe651e14898&source=---read_next_recirc--61866fafc844----2-----------------bookmark_preview----f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

![Image 33: Building Multilingual Flutter Apps: A Complete Guide to Flutter Localization](https://miro.medium.com/v2/resize:fit:679/format:webp/1*pECbRBjCqZ2yDqcQfRhxDg.png)

[![Image 34: Oluwaseun Akintade](https://miro.medium.com/v2/resize:fill:20:20/1*ACA9wR8AmjFVcw-DUQBVUQ@2x.jpeg)](https://medium.com/@akintadeseun816?source=post_page---read_next_recirc--61866fafc844----3---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[Oluwaseun Akintade](https://medium.com/@akintadeseun816?source=post_page---read_next_recirc--61866fafc844----3---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

·

May 5

## [Building Multilingual Flutter Apps: A Complete Guide to Flutter Localization ### When I started building Hubbit, my AI Habit Tracker app, I had one thing in mind: build fast and ship. Localization was on the roadmap…](https://medium.com/@akintadeseun816/building-multilingual-flutter-apps-a-complete-guide-to-flutter-localization-ba96722530a3?source=post_page---read_next_recirc--61866fafc844----3---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[2](https://medium.com/@akintadeseun816/building-multilingual-flutter-apps-a-complete-guide-to-flutter-localization-ba96722530a3?source=post_page---read_next_recirc--61866fafc844----3---------------------f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fmedium.com%2Fflutter-community%2Fflutter-login-with-rest-api-and-sqlite-using-blocs-61866fafc844&source=---read_next_recirc--61866fafc844----3-----------------explicit_signal----f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2F_%2Fbookmark%2Fp%2Fba96722530a3&operation=register&redirect=https%3A%2F%2Fmedium.com%2F%40akintadeseun816%2Fbuilding-multilingual-flutter-apps-a-complete-guide-to-flutter-localization-ba96722530a3&source=---read_next_recirc--61866fafc844----3-----------------bookmark_preview----f3d440cd_3de1_434c_a7e3_885ecb4facf2--------------)

[See more recommendations](https://medium.com/?source=post_page---read_next_recirc--61866fafc844---------------------------------------)

[Help](https://help.medium.com/hc/en-us?source=post_page-----61866fafc844---------------------------------------)

[Status](https://status.medium.com/?source=post_page-----61866fafc844---------------------------------------)

[About](https://medium.com/about?autoplay=1&source=post_page-----61866fafc844---------------------------------------)

[Careers](https://medium.com/jobs-at-medium/work-at-medium-959d1a85284e?source=post_page-----61866fafc844---------------------------------------)

[Press](mailto:pressinquiries@medium.com)

[Blog](https://blog.medium.com/?source=post_page-----61866fafc844---------------------------------------)

[Privacy](https://policy.medium.com/medium-privacy-policy-f03bf92035c9?source=post_page-----61866fafc844---------------------------------------)

[Rules](https://policy.medium.com/medium-rules-30e5502c4eb4?source=post_page-----61866fafc844---------------------------------------)

[Terms](https://policy.medium.com/medium-terms-of-service-9db0094a1e0f?source=post_page-----61866fafc844---------------------------------------)

[Text to speech](https://speechify.com/medium?source=post_page-----61866fafc844---------------------------------------)