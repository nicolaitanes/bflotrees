#!/bin/sh

if [ $(ps -e -o uid,cmd | grep $UID | grep node | grep mg | grep -v grep | wc -l | tr -s "\n") -eq 0 ]
then
    export PATH=/usr/local/bin:$PATH
    export STATIC_PATH=/home/cnicolai/bflotrees/static
    export ORIGIN=https://bflotrees.mandelics.com
    forever start --sourceDir /home/cnicolai/bflotrees -a -o /home/cnicolai/bflotrees/log/app-2.log -e /home/cnicolai/bflotrees/log/err-2.log index.js
fi
