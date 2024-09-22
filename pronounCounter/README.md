# How to setup the project:
1. Download the repo
2. Open the project in your favorite code/text editor
3. Create a .env file with the following credentials filled out:
```
# xoxb-
SLACK_BOT_TOKEN=
# Random
SLACK_SIGNING_SECRET=
# xapp-
SLACK_APP_TOKEN=
```
4. Make sure your bot has the appropriate permissions (`users:read` & `users.profile:read`)
5. Make sure the device you are running the program on will stay running for 7 hours per 50k slack members
    - If you are running this on a remote server, you can run start.sh to spin up a tmux session!

# Other notes:
The code isn't the most straightforwards As I was originally doing this project just out of curiosity and didn't need a shiny polished product. Feel free to submit PR's if you want to clean up the code/make it better!